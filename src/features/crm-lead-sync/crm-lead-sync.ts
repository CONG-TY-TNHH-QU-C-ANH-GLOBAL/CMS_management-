// CMS -> CRM website-lead outbox. Never send directly from the form handler:
// CMS records the inquiry first, then this worker projects an immutable event
// to CRM with retries. `cms:lead:<id>` is the cross-system idempotency key.

import { env } from "cloudflare:workers";

import { getDb } from "@/core/db/client";
import type { CreateLeadInput, LeadRow } from "@/features/leads";

const MAX_ATTEMPTS = 12;
const LEASE_SECONDS = 120;
const RETRY_CAP_SECONDS = 30 * 60;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_RECONCILE_PER_RUN = 100;

type CmsLeadPayload = {
  schemaVersion: 1;
  eventType: "lead.created";
  sourceSystem: "THG_CMS";
  eventId: string;
  occurredAt: string;
  lead: {
    cmsLeadId: number;
    name: string;
    email: string;
    companyUrl: string | null;
    monthlyOrderBand: string | null;
    shipToMarkets: string[];
    phone: string | null;
    message: string | null;
    sourcePage: string | null;
    locale: string | null;
    utm: Record<string, string> | null;
    primaryService: string | null;
    surface: string | null;
    serviceInterests: string[];
    serviceDetails: Record<string, unknown> | null;
  };
};

interface OutboxRow {
  id: number;
  lead_id: number;
  payload_json: string;
  attempts: number;
}

export type DeliveryState = "missing" | "pending" | "sent" | "failed";

export interface CrmLeadDeliveryRow {
  leadId: number;
  createdAt: number;
  crmOutboxId: number | null;
  crmState: DeliveryState;
  crmAttempts: number;
  crmLastError: string | null;
  telegramState: DeliveryState;
  telegramTotal: number;
  telegramSent: number;
  telegramFailed: number;
}

export interface CrmLeadDeliveryHealth {
  crmUrlConfigured: boolean;
  crmSecretConfigured: boolean;
  rows: CrmLeadDeliveryRow[];
}

interface DeliveryQueryRow {
  lead_id: number;
  created_at: number;
  crm_outbox_id: number | null;
  crm_attempts: number | null;
  crm_last_error: string | null;
  crm_sent_at: number | null;
  crm_failed_at: number | null;
  telegram_total: number;
  telegram_sent: number;
  telegram_failed: number;
}

function safeJson<T>(value: string | null, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function payloadFromInput(id: number, input: CreateLeadInput): CmsLeadPayload {
  return {
    schemaVersion: 1,
    eventType: "lead.created",
    sourceSystem: "THG_CMS",
    eventId: `cms:lead:${id}`,
    occurredAt: new Date().toISOString(),
    lead: {
      cmsLeadId: id,
      name: input.name.trim(),
      email: input.email.toLowerCase().trim(),
      companyUrl: input.company_url ?? null,
      monthlyOrderBand: input.monthly_order_band ?? null,
      shipToMarkets: input.ship_to_markets ?? [],
      phone: input.phone ?? null,
      message: input.message ?? null,
      sourcePage: input.source_page ?? null,
      locale: input.locale ?? null,
      utm: input.utm ?? null,
      primaryService: input.primary_service ?? null,
      surface: input.surface ?? null,
      serviceInterests: input.service_interests ?? [],
      serviceDetails: input.service_details ?? null,
    },
  };
}

function payloadFromRow(row: LeadRow): CmsLeadPayload {
  return {
    schemaVersion: 1,
    eventType: "lead.created",
    sourceSystem: "THG_CMS",
    eventId: `cms:lead:${row.id}`,
    occurredAt: new Date(row.created_at * 1000).toISOString(),
    lead: {
      cmsLeadId: row.id,
      name: row.name,
      email: row.email,
      companyUrl: row.company_url,
      monthlyOrderBand: row.monthly_order_band,
      shipToMarkets: safeJson<string[]>(row.ship_to_markets_json, []),
      phone: row.phone,
      message: row.message,
      sourcePage: row.source_page,
      locale: row.locale,
      utm: safeJson<Record<string, string> | null>(row.utm_json, null),
      primaryService: row.primary_service,
      surface: row.surface,
      serviceInterests: safeJson<string[]>(row.service_interests_json, []),
      serviceDetails: safeJson<Record<string, unknown> | null>(row.service_details_json, null),
    },
  };
}

async function enqueuePayload(payload: CmsLeadPayload): Promise<void> {
  await getDb()
    .prepare(
      `INSERT OR IGNORE INTO crm_lead_outbox (lead_id, event_key, payload_json, next_attempt_at)
       VALUES (?, ?, ?, unixepoch())`,
    )
    .bind(payload.lead.cmsLeadId, payload.eventId, JSON.stringify(payload))
    .run();
}

/** Enqueue a newly accepted form submission. This does not call CRM inline. */
export async function enqueueCrmLeadSync(id: number, input: CreateLeadInput): Promise<void> {
  await enqueuePayload(payloadFromInput(id, input));
}

/** Backfill any CMS lead that was written before the outbox was introduced or
 * whose initial enqueue failed. No PII is logged. */
export async function reconcileCrmLeadOutbox(limit = MAX_RECONCILE_PER_RUN): Promise<number> {
  const result = await getDb()
    .prepare(
      `SELECT l.* FROM leads l
       LEFT JOIN crm_lead_outbox o ON o.lead_id = l.id
       WHERE o.id IS NULL
       ORDER BY l.id ASC
       LIMIT ?`,
    )
    .bind(Math.max(1, Math.min(limit, MAX_RECONCILE_PER_RUN)))
    .all<LeadRow>();
  for (const row of result.results ?? []) await enqueuePayload(payloadFromRow(row));
  return result.results?.length ?? 0;
}

function stateOf(
  outboxId: number | null,
  sent: number | null,
  failed: number | null,
): DeliveryState {
  if (outboxId === null) return "missing";
  if (sent !== null) return "sent";
  if (failed !== null) return "failed";
  return "pending";
}

/** Recent website lead delivery state for operators. Payload and contact data are
 * intentionally excluded so this endpoint cannot expose lead PII. */
export async function getCrmLeadDeliveryHealth(limit = 30): Promise<CrmLeadDeliveryHealth> {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const result = await getDb()
    .prepare(
      `SELECT l.id AS lead_id, l.created_at,
              o.id AS crm_outbox_id, o.attempts AS crm_attempts,
              o.last_error AS crm_last_error, o.sent_at AS crm_sent_at,
              o.failed_permanently_at AS crm_failed_at,
              (SELECT COUNT(*) FROM telegram_outbox t
               WHERE t.event_type = 'lead_received'
                 AND t.idempotency_key LIKE 'lead:' || l.id || ':%') AS telegram_total,
              (SELECT COUNT(*) FROM telegram_outbox t
               WHERE t.event_type = 'lead_received' AND t.sent_at IS NOT NULL
                 AND t.idempotency_key LIKE 'lead:' || l.id || ':%') AS telegram_sent,
              (SELECT COUNT(*) FROM telegram_outbox t
               WHERE t.event_type = 'lead_received' AND t.failed_permanently_at IS NOT NULL
                 AND t.idempotency_key LIKE 'lead:' || l.id || ':%') AS telegram_failed
       FROM leads l
       LEFT JOIN crm_lead_outbox o ON o.lead_id = l.id
       ORDER BY l.id DESC
       LIMIT ?`,
    )
    .bind(safeLimit)
    .all<DeliveryQueryRow>();

  return {
    crmUrlConfigured: Boolean(env.CRM_LEAD_SYNC_URL),
    crmSecretConfigured: Boolean(env.CMS_CRM_SYNC_KEY),
    rows: (result.results ?? []).map((row) => {
      const telegramTotal = Number(row.telegram_total ?? 0);
      const telegramSent = Number(row.telegram_sent ?? 0);
      const telegramFailed = Number(row.telegram_failed ?? 0);
      const telegramState: DeliveryState =
        telegramTotal === 0
          ? "missing"
          : telegramFailed > 0
            ? "failed"
            : telegramSent === telegramTotal
              ? "sent"
              : "pending";
      return {
        leadId: row.lead_id,
        createdAt: row.created_at,
        crmOutboxId: row.crm_outbox_id,
        crmState: stateOf(row.crm_outbox_id, row.crm_sent_at, row.crm_failed_at),
        crmAttempts: Number(row.crm_attempts ?? 0),
        crmLastError: row.crm_last_error,
        telegramState,
        telegramTotal,
        telegramSent,
        telegramFailed,
      };
    }),
  };
}

/** Recreate a missing Telegram delivery after channels/subscriptions are fixed. */
export async function replayLeadTelegramDelivery(leadId: number): Promise<number> {
  const lead = await getDb()
    .prepare("SELECT * FROM leads WHERE id = ?")
    .bind(leadId)
    .first<LeadRow>();
  if (!lead) throw new Error("Website Lead không tồn tại");
  const { dispatchEvent } = await import("@/features/telegram");
  return await dispatchEvent({
    event_type: "lead_received",
    idempotency_key: `lead:${lead.id}`,
    payload: {
      id: lead.id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      message: lead.message,
      source_page: lead.source_page,
      locale: lead.locale,
      primary_service: lead.primary_service,
      service_interests: safeJson<string[]>(lead.service_interests_json, []),
    },
  });
}

/** Reopen a permanently failed CRM delivery. Pending and sent rows are left alone. */
export async function retryCrmLeadDelivery(id: number): Promise<boolean> {
  const result = await getDb()
    .prepare(
      `UPDATE crm_lead_outbox
       SET failed_permanently_at = NULL, attempts = 0, next_attempt_at = unixepoch(),
           last_error = NULL, updated_at = unixepoch()
       WHERE id = ? AND sent_at IS NULL AND failed_permanently_at IS NOT NULL`,
    )
    .bind(id)
    .run();
  const meta = result.meta as { changes?: number; rows_written?: number } | undefined;
  return (meta?.changes ?? meta?.rows_written ?? 0) > 0;
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function claimOne(): Promise<OutboxRow | null> {
  const db = getDb();
  const row = await db
    .prepare(
      `SELECT id, lead_id, payload_json, attempts FROM crm_lead_outbox
       WHERE sent_at IS NULL AND failed_permanently_at IS NULL
         AND next_attempt_at <= unixepoch()
       ORDER BY id ASC LIMIT 1`,
    )
    .first<OutboxRow>();
  if (!row) return null;
  const claimed = await db
    .prepare(
      `UPDATE crm_lead_outbox SET next_attempt_at = unixepoch() + ?, updated_at = unixepoch()
       WHERE id = ? AND sent_at IS NULL AND failed_permanently_at IS NULL
         AND next_attempt_at <= unixepoch()`,
    )
    .bind(LEASE_SECONDS, row.id)
    .run();
  const changes =
    (claimed.meta as { changes?: number; rows_written?: number } | undefined)?.changes ??
    (claimed.meta as { rows_written?: number } | undefined)?.rows_written ??
    0;
  return changes > 0 ? row : null;
}

function retryDelaySeconds(attempt: number): number {
  return Math.min(60 * Math.pow(2, Math.max(0, attempt - 1)), RETRY_CAP_SECONDS);
}

async function markAttempt(row: OutboxRow, status: number, detail: string): Promise<void> {
  const attempts = row.attempts + 1;
  const permanent = status === 400 || status === 409 || attempts >= MAX_ATTEMPTS;
  const message = `${status} ${detail}`.trim().slice(0, 400);
  if (permanent) {
    await getDb()
      .prepare(
        `UPDATE crm_lead_outbox
         SET attempts = ?, failed_permanently_at = unixepoch(), last_error = ?, updated_at = unixepoch()
         WHERE id = ?`,
      )
      .bind(attempts, message, row.id)
      .run();
    return;
  }
  await getDb()
    .prepare(
      `UPDATE crm_lead_outbox
       SET attempts = ?, next_attempt_at = unixepoch() + ?, last_error = ?, updated_at = unixepoch()
       WHERE id = ?`,
    )
    .bind(attempts, retryDelaySeconds(attempts), message, row.id)
    .run();
}

/** Drain pending CMS leads within a bounded scheduled-worker budget. */
export async function flushCrmLeadOutbox(budgetMs = 50_000): Promise<void> {
  await reconcileCrmLeadOutbox();
  const url = env.CRM_LEAD_SYNC_URL;
  const secret = env.CMS_CRM_SYNC_KEY;
  if (!url || !secret) {
    console.warn("[crm-lead-sync] CRM_LEAD_SYNC_URL/CMS_CRM_SYNC_KEY missing; outbox retained");
    return;
  }
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    const row = await claimOne();
    if (!row) return;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = await hmacHex(secret, `${timestamp}.${row.payload_json}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-thg-timestamp": timestamp,
          "x-thg-signature": signature,
        },
        body: row.payload_json,
        signal: controller.signal,
      });
      if (response.ok) {
        await getDb()
          .prepare(
            `UPDATE crm_lead_outbox
             SET sent_at = unixepoch(), last_error = NULL, updated_at = unixepoch()
             WHERE id = ?`,
          )
          .bind(row.id)
          .run();
      } else {
        await markAttempt(row, response.status, "CRM rejected lead event");
      }
    } catch (error) {
      await markAttempt(row, 0, error instanceof Error ? error.name : "CRM request failed");
    } finally {
      clearTimeout(timeout);
    }
  }
}
