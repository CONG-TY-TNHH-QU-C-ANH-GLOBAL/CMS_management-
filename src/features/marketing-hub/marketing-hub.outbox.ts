import { env } from "cloudflare:workers";
import "@/core/db/env";
import { getDb } from "@/core/db/client";
import { canonical, hmac, readBounded } from "./marketing-hub.crypto";
import { hubEnvelopeSchema } from "./marketing-hub.schemas";
import { atomic, contentTable, getHubContent, guard, isConflict } from "./marketing-hub.repository";
import { configuredHttps, publicUrl } from "./marketing-hub.service";

interface OutboxRow {
  event_id: string;
  external_id: string;
  cms_revision: number;
  source_payload_json: string;
  snapshot_json: string;
  publisher_id: number | null;
  posted_at: string;
  payload_json: string | null;
  attempts: number;
  state: string;
}
function deliveryError(code: string, retryable = false): never {
  throw Object.assign(new Error(code), { retryable });
}
async function deliver(row: OutboxRow) {
  const db = getDb();
  const token = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await atomic([
      guard(
        `EXISTS(SELECT 1 FROM marketing_hub_outbox WHERE event_id=? AND attempts=? AND
        ((state IN ('pending','retry_wait') AND (next_attempt_at IS NULL OR next_attempt_at<=?)) OR (state='processing' AND lease_until<=?)))`,
        [row.event_id, row.attempts, now, now],
      ),
      db
        .prepare(
          "UPDATE marketing_hub_outbox SET state='processing',attempts=attempts+1,lease_token=?,lease_until=?,updated_at=? WHERE event_id=?",
        )
        .bind(token, new Date(Date.now() + 120000).toISOString(), now, row.event_id),
    ]);
  } catch (error) {
    if (isConflict(error)) return;
    throw error;
  }
  const lease = () =>
    guard(
      "EXISTS(SELECT 1 FROM marketing_hub_outbox WHERE event_id=? AND state='processing' AND lease_token=?)",
      [row.event_id, token],
    );
  const attempt = row.attempts + 1;
  try {
    const endpoint = configuredHttps(env.MARKETING_HUB_CALLBACK_URL);
    if (!endpoint || !env.MARKETING_HUB_SIGNING_SECRET) deliveryError("CALLBACK_NOT_CONFIGURED");
    if (attempt > 8) deliveryError("ATTEMPTS_EXHAUSTED");
    const source = hubEnvelopeSchema.parse(JSON.parse(row.source_payload_json));
    const current = await getHubContent(row.external_id);
    if (
      !current ||
      current.cms_revision !== row.cms_revision ||
      current.payload_hash !== source.payloadHash
    )
      deliveryError("STALE_CMS_REVISION");
    const published = await db
      .prepare(`SELECT status FROM ${contentTable(current.kind)} WHERE id=?`)
      .bind(current.content_id)
      .first<{ status: string }>();
    if (published?.status !== "live") deliveryError("CONTENT_NOT_LIVE");
    if (canonical(JSON.parse(row.snapshot_json)) !== canonical(source.renderedContent))
      deliveryError("APPROVED_CONTENT_CHANGED");
    const publisher = await db
      .prepare("SELECT id FROM users WHERE id=? AND role IN ('admin','editor') AND status='active'")
      .bind(row.publisher_id)
      .first();
    if (!publisher) deliveryError("HUMAN_PUBLISHER_REQUIRED");
    const output = publicUrl(current.kind, current.locale, current.slug);
    if (!output) deliveryError("PUBLIC_ORIGIN_NOT_CONFIGURED");
    const payload =
      row.payload_json ||
      JSON.stringify({
        type: "content.published",
        data: {
          externalId: source.externalId,
          taskId: source.taskId,
          versionId: source.versionId,
          approvalId: source.approvalId,
          sourceRevision: source.sourceRevision,
          contentHash: source.contentHash,
          payloadHash: source.payloadHash,
          cmsRevision: row.cms_revision,
          publicUrl: output,
          postedAt: row.posted_at,
          publisher: String(row.publisher_id),
          slug: source.slug,
          locale: source.locale,
        },
      });
    await atomic([
      lease(),
      db
        .prepare(
          "UPDATE marketing_hub_outbox SET payload_json=COALESCE(payload_json,?) WHERE event_id=?",
        )
        .bind(payload, row.event_id),
    ]);
    const timestamp = new Date().toISOString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-thg-contract": "marketing-hub-content.v1",
          "x-thg-event-id": row.event_id,
          "x-thg-timestamp": timestamp,
          "x-thg-signature": `v1=${await hmac(env.MARKETING_HUB_SIGNING_SECRET, `${timestamp}\n${row.event_id}\n${payload}`)}`,
        },
        body: payload,
      });
      if (!response.ok) {
        void response.body?.cancel();
        deliveryError(
          `CRM_HTTP_${response.status}`,
          response.status === 408 || response.status === 429 || response.status >= 500,
        );
      }
      const body = await readBounded(response, 32768);
      let ack: { ok?: boolean; taskId?: string };
      try {
        ack = JSON.parse(body);
      } catch {
        deliveryError("INVALID_CALLBACK_ACK");
      }
      if (ack.ok !== true || ack.taskId !== source.taskId) deliveryError("INVALID_CALLBACK_ACK");
    } finally {
      clearTimeout(timer);
    }
    await atomic([
      lease(),
      db
        .prepare(
          "UPDATE marketing_hub_outbox SET state='succeeded',lease_token=NULL,lease_until=NULL,error_code=NULL,updated_at=? WHERE event_id=?",
        )
        .bind(new Date().toISOString(), row.event_id),
    ]);
  } catch (error) {
    if (isConflict(error)) return;
    const explicit = typeof error === "object" && error && "retryable" in error;
    const retryable = explicit ? Boolean(error.retryable) : !(error instanceof SyntaxError);
    const retry = retryable && attempt < 8;
    const delay = Math.min(3600000, 30000 * 2 ** Math.min(attempt - 1, 7));
    const code =
      error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
        ? error.message
        : "CALLBACK_NETWORK_OR_STORAGE_FAILURE";
    try {
      await atomic([
        lease(),
        db
          .prepare(
            "UPDATE marketing_hub_outbox SET state=?,next_attempt_at=?,lease_token=NULL,lease_until=NULL,error_code=?,updated_at=? WHERE event_id=?",
          )
          .bind(
            retry ? "retry_wait" : "blocked",
            retry ? new Date(Date.now() + delay).toISOString() : null,
            code,
            new Date().toISOString(),
            row.event_id,
          ),
      ]);
    } catch (saveError) {
      if (!isConflict(saveError)) throw saveError;
    }
  }
}
export async function flushMarketingHubOutbox(budgetMs = 50000): Promise<void> {
  if (env.MARKETING_HUB_CALLBACKS_ENABLED !== "true") return;
  const started = Date.now();
  const now = new Date().toISOString();
  const due = await getDb()
    .prepare(
      `SELECT * FROM marketing_hub_outbox WHERE
    (state IN ('pending','retry_wait') AND (next_attempt_at IS NULL OR next_attempt_at<=?))
    OR (state='processing' AND lease_until<=?) ORDER BY created_at,event_id LIMIT 10`,
    )
    .bind(now, now)
    .all<OutboxRow>();
  for (const row of due.results || []) {
    if (Date.now() - started > budgetMs - 16000) break;
    try {
      await deliver(row);
    } catch {
      console.error("[marketing-hub] callback storage failure", row.event_id);
    }
  }
}
