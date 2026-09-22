import { env } from "cloudflare:workers";
import "@/core/db/env";
import { getDb } from "@/core/db/client";
import { canonical, digest } from "./marketing-hub.crypto";
import {
  hubEnvelopeSchema,
  hubEventSchema,
  hubBlogSchema,
  hubReadResponseSchema,
  hubMediaSchema,
  hubRetrySchema,
} from "./marketing-hub.schemas";
import {
  atomic,
  command,
  contentTable,
  getHubContent,
  guard,
  isConflict,
  saveCommand,
  serviceActor,
} from "./marketing-hub.repository";

export function fail(code: string, statusCode: number): never {
  throw Object.assign(new Error(code), { statusCode });
}
export function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
async function replay(id: string, hash: string): Promise<Response | null> {
  const existing = await command(id);
  if (!existing) return null;
  if (existing.request_hash !== hash) fail("IDEMPOTENCY_KEY_REUSED", 409);
  return new Response(existing.response_json, {
    status: existing.response_status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
export function configuredHttps(value: string | undefined): URL | null {
  try {
    const url = new URL(value || "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      url.hostname === "localhost" ||
      url.hostname.endsWith(".local") ||
      url.hostname.endsWith(".internal") ||
      url.hostname.includes(":") ||
      /^\d+(\.\d+){3}$/.test(url.hostname)
    )
      return null;
    return url;
  } catch {
    return null;
  }
}
export function publicUrl(kind: "event" | "blog", locale: string, slug: string): string | null {
  const url = configuredHttps(env.MARKETING_HUB_PUBLIC_ORIGIN);
  if (!url) return null;
  url.pathname = `/${locale}/${kind === "event" ? "events" : "blog"}/${slug}`;
  url.search = "";
  return url.toString();
}

export async function ingestHubContent(
  raw: string,
  commandId: string,
  requestHash: string,
): Promise<Response> {
  const previous = await replay(commandId, requestHash);
  if (previous) return previous;
  const payload = hubEnvelopeSchema.parse(JSON.parse(raw));
  if (!payload.externalId.startsWith(`crm:${payload.taskId}:`)) fail("EXTERNAL_ID_MISMATCH", 422);
  const { payloadHash, ...unsigned } = payload;
  if (
    (await digest(canonical(unsigned))) !== payloadHash ||
    (await digest(canonical(payload.content))) !== payload.contentHash
  )
    fail("CONTENT_HASH_MISMATCH", 422);
  const projection =
    payload.kind === "event"
      ? hubEventSchema.parse(payload.renderedContent)
      : hubBlogSchema.parse(payload.renderedContent);
  const old = await getHubContent(payload.externalId);
  if (
    old &&
    (old.kind !== payload.kind ||
      old.slug !== payload.slug ||
      old.locale !== payload.locale ||
      payload.sourceRevision <= old.source_revision)
  )
    fail("SOURCE_REVISION_OR_IDENTITY_CONFLICT", 409);
  const table = contentTable(payload.kind);
  const db = getDb();
  const actor = await serviceActor();
  const now = new Date().toISOString();
  const revision = old ? old.cms_revision + 1 : 1;
  const acknowledgement = {
    ok: true,
    status: "draft",
    externalId: payload.externalId,
    taskId: payload.taskId,
    versionId: payload.versionId,
    approvalId: payload.approvalId,
    sourceRevision: payload.sourceRevision,
    payloadHash,
    contentHash: payload.contentHash,
    cmsRevision: revision,
    slug: payload.slug,
    locale: payload.locale,
  };
  // Column names originate ONLY from strict kind-specific schemas, never arbitrary JSON keys.
  const columns = Object.keys(projection);
  const values = Object.values(projection);
  const statements = old
    ? [
        guard(
          `EXISTS(SELECT 1 FROM marketing_hub_contents m JOIN ${table} c ON c.id=m.content_id
      WHERE m.external_id=? AND m.cms_revision=? AND m.source_revision=? AND c.status='draft')`,
          [old.external_id, old.cms_revision, old.source_revision],
        ),
        db
          .prepare(
            `UPDATE ${table} SET ${columns.map((column) => `${column}=?`).join(",")},updated_by=?,updated_at=unixepoch() WHERE id=?`,
          )
          .bind(...values, actor, old.content_id),
        db
          .prepare(
            `UPDATE marketing_hub_contents SET source_revision=?,cms_revision=?,payload_json=?,payload_hash=?,projection_json=?,updated_at=? WHERE external_id=?`,
          )
          .bind(
            payload.sourceRevision,
            revision,
            raw,
            payloadHash,
            canonical(projection),
            now,
            payload.externalId,
          ),
      ]
    : [
        guard(
          `NOT EXISTS(SELECT 1 FROM marketing_hub_contents WHERE external_id=?) AND NOT EXISTS(SELECT 1 FROM ${table} WHERE slug=? AND locale=?)`,
          [payload.externalId, payload.slug, payload.locale],
        ),
        db
          .prepare(
            `INSERT INTO ${table}(slug,locale,${columns.join(",")},status,updated_by,updated_at${payload.kind === "blog" ? ",author_id" : ""})
      VALUES (?, ?, ${columns.map(() => "?").join(",")},'draft',?,unixepoch()${payload.kind === "blog" ? ",?" : ""})`,
          )
          .bind(
            payload.slug,
            payload.locale,
            ...values,
            actor,
            ...(payload.kind === "blog" ? [actor] : []),
          ),
        db
          .prepare(
            `INSERT INTO marketing_hub_contents(external_id,kind,slug,locale,content_id,source_revision,cms_revision,payload_json,payload_hash,projection_json,created_at,updated_at)
      SELECT ?,?,?,?,id,?,1,?,?,?,?,? FROM ${table} WHERE slug=? AND locale=?`,
          )
          .bind(
            payload.externalId,
            payload.kind,
            payload.slug,
            payload.locale,
            payload.sourceRevision,
            raw,
            payloadHash,
            canonical(projection),
            now,
            now,
            payload.slug,
            payload.locale,
          ),
      ];
  statements.push(
    db
      .prepare(
        "INSERT INTO audit_log(actor_id,action,entity,entity_id,after_json) VALUES (?,'marketing_hub_draft','marketing_hub_contents',?,?)",
      )
      .bind(actor, payload.externalId, JSON.stringify(acknowledgement)),
    saveCommand(commandId, requestHash, acknowledgement, old ? 200 : 201),
  );
  try {
    await atomic(statements);
  } catch (error) {
    const won = await replay(commandId, requestHash);
    if (won) return won;
    if (isConflict(error)) fail("CMS_CONTENT_CHANGED_OR_SLUG_OWNED", 409);
    throw error;
  }
  return json(acknowledgement, old ? 200 : 201);
}

export async function readHubContent(externalId: string): Promise<Response> {
  const mapping = await getHubContent(externalId);
  if (!mapping) fail("CONTENT_NOT_FOUND", 404);
  const content = await getDb()
    .prepare(`SELECT status FROM ${contentTable(mapping.kind)} WHERE id=?`)
    .bind(mapping.content_id)
    .first<{ status: string }>();
  const source = hubEnvelopeSchema.parse(JSON.parse(mapping.payload_json));
  const callbacks = await getDb()
    .prepare(
      `SELECT event_id AS eventId,state,attempts,error_code AS errorCode
    FROM marketing_hub_outbox WHERE external_id=? ORDER BY created_at DESC,event_id DESC LIMIT 20`,
    )
    .bind(externalId)
    .all();
  return json(
    hubReadResponseSchema.parse({
      externalId,
      taskId: source.taskId,
      versionId: source.versionId,
      approvalId: source.approvalId,
      sourceRevision: mapping.source_revision,
      payloadHash: mapping.payload_hash,
      contentHash: source.contentHash,
      kind: mapping.kind,
      locale: mapping.locale,
      slug: mapping.slug,
      cmsRevision: mapping.cms_revision,
      status: content?.status || "missing",
      publicUrl:
        content?.status === "live" ? publicUrl(mapping.kind, mapping.locale, mapping.slug) : null,
      callbacks: callbacks.results || [],
    }),
  );
}

export async function ingestHubMedia(
  raw: string,
  commandId: string,
  requestHash: string,
): Promise<Response> {
  const previous = await replay(commandId, requestHash);
  if (previous) return previous;
  const payload = hubMediaSchema.parse(JSON.parse(raw));
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload.dataBase64))
    fail("INVALID_BASE64", 422);
  const bytes = Uint8Array.from(atob(payload.dataBase64), (char) => char.charCodeAt(0));
  if (!bytes.length || bytes.length > 1024 * 1024) fail("IMAGE_SIZE_LIMIT", 413);
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp =
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  if (!(payload.mime === "image/png" ? png : payload.mime === "image/jpeg" ? jpeg : webp))
    fail("IMAGE_SIGNATURE_MISMATCH", 422);
  const contentHash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const key = `marketing/${contentHash}.${payload.mime === "image/png" ? "png" : payload.mime === "image/jpeg" ? "jpg" : "webp"}`;
  const actor = await serviceActor();
  const result = {
    ok: true,
    key,
    mime: payload.mime,
    bytes: bytes.length,
    contentHash,
    path: `/api/v1/media/${key}`,
  };
  // Content-addressed immutable object: a retry safely reuses it. Never delete
  // on DB conflict, which could erase the winner's referenced object.
  await env.MEDIA.put(key, bytes, {
    httpMetadata: { contentType: payload.mime, cacheControl: "public,max-age=31536000,immutable" },
  });
  try {
    await atomic([
      getDb()
        .prepare(
          "INSERT INTO media(r2_key,mime,bytes,alt_text,status,uploaded_by) VALUES (?,?,?,?,'ready',?) ON CONFLICT(r2_key) DO NOTHING",
        )
        .bind(key, payload.mime, bytes.length, payload.altText, actor),
      getDb()
        .prepare(
          "INSERT INTO audit_log(actor_id,action,entity,entity_id,after_json) VALUES (?,'marketing_hub_media','media',?,?)",
        )
        .bind(actor, key, JSON.stringify(result)),
      saveCommand(commandId, requestHash, result, 201),
    ]);
  } catch (error) {
    const won = await replay(commandId, requestHash);
    if (won) return won;
    throw error;
  }
  return json(result, 201);
}

export async function retryHubCallback(
  eventId: string,
  raw: string,
  commandId: string,
  requestHash: string,
): Promise<Response> {
  const previous = await replay(commandId, requestHash);
  if (previous) return previous;
  const { expectedAttempts } = hubRetrySchema.parse(JSON.parse(raw));
  const row = await getDb()
    .prepare(
      "SELECT external_id,cms_revision,state,attempts FROM marketing_hub_outbox WHERE event_id=?",
    )
    .bind(eventId)
    .first<{ external_id: string; cms_revision: number; state: string; attempts: number }>();
  if (!row) fail("CALLBACK_NOT_FOUND", 404);
  const actor = await serviceActor();
  const result = { ok: true, eventId, state: "pending", attempts: 0 };
  try {
    await atomic([
      guard(
        `EXISTS(SELECT 1 FROM marketing_hub_outbox o JOIN marketing_hub_contents c ON c.external_id=o.external_id
        WHERE o.event_id=? AND o.attempts=? AND o.state IN ('blocked','retry_wait') AND o.cms_revision=c.cms_revision)`,
        [eventId, expectedAttempts],
      ),
      getDb()
        .prepare(
          "UPDATE marketing_hub_outbox SET state='pending',attempts=0,error_code=NULL,lease_token=NULL,lease_until=NULL,next_attempt_at=?,updated_at=? WHERE event_id=?",
        )
        .bind(new Date().toISOString(), new Date().toISOString(), eventId),
      getDb()
        .prepare(
          "INSERT INTO audit_log(actor_id,action,entity,entity_id,before_json,after_json) VALUES (?,'marketing_hub_callback_retry','marketing_hub_outbox',?,?,?)",
        )
        .bind(actor, eventId, JSON.stringify(row), JSON.stringify(result)),
      saveCommand(commandId, requestHash, result, 202),
    ]);
  } catch (error) {
    const won = await replay(commandId, requestHash);
    if (won) return won;
    if (isConflict(error)) fail("CALLBACK_CHANGED_OR_NOT_RETRYABLE", 409);
    throw error;
  }
  return json(result, 202);
}
