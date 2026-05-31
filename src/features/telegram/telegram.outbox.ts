// Durable outbox flush worker. Runs from the scheduled handler (every minute)
// AND inline-kicked from dispatchEvent() so a successful lead notification
// arrives in ~1s. Lease pattern: optimistic UPDATE pushes next_attempt_at to
// a future placeholder so a parallel cron tick (rare with D1 single-writer,
// but possible across worker invocations) can't double-send the same row.
//
// Backoff: 60s, 120s, 240s, 480s, 960s (capped at 30min). After 5 attempts the
// row is marked failed_permanently_at; the admin "Failed sends" tab surfaces
// these so operators can investigate + retry.

import { getDb } from "@/core/db/client";
import { sendTelegramMessage } from "./telegram.api";

const MAX_ATTEMPTS = 5;
const BUDGET_MS_DEFAULT = 60_000;
const LEASE_SEC = 600; // hide the row from other claimers for 10 minutes
const BACKOFF_CAP_SEC = 1800; // 30 min

interface OutboxRow {
  id: number;
  channel_id: number;
  chat_id: string;
  body_text: string;
  attempts: number;
}

async function getBotToken(): Promise<string | null> {
  const row = await getDb()
    .prepare(`SELECT bot_token FROM telegram_config WHERE id = 1`)
    .first<{ bot_token: string | null }>();
  return row?.bot_token ?? null;
}

/** Claim one pending row by leasing it (push next_attempt_at into future).
 *  Returns null if no work or someone else won the race. */
async function claimOne(): Promise<OutboxRow | null> {
  // Pick a candidate. D1 has no `SELECT FOR UPDATE`; we use optimistic claim.
  const row = await getDb()
    .prepare(
      `SELECT id, channel_id, chat_id, body_text, attempts
       FROM telegram_outbox
       WHERE sent_at IS NULL
         AND failed_permanently_at IS NULL
         AND next_attempt_at <= unixepoch()
       ORDER BY id ASC LIMIT 1`,
    )
    .first<OutboxRow>();
  if (!row) return null;
  // Try to claim — only succeeds if next_attempt_at is still in the past
  // (i.e. no other flusher just leased it).
  const result = await getDb()
    .prepare(
      `UPDATE telegram_outbox SET next_attempt_at = unixepoch() + ?
       WHERE id = ?
         AND sent_at IS NULL
         AND failed_permanently_at IS NULL
         AND next_attempt_at <= unixepoch()`,
    )
    .bind(LEASE_SEC, row.id)
    .run();
  // D1 result shape: meta.changes (Bun) or meta.rows_written (CF). Both
  // resolve to 1 on success / 0 on race-loss. We treat 0/undefined as a loss.
  const changes = (result.meta as { changes?: number; rows_written?: number } | undefined)?.changes
    ?? (result.meta as { rows_written?: number } | undefined)?.rows_written
    ?? 0;
  return changes >= 1 ? row : null;
}

function backoffSec(attempt: number, retryAfterSec?: number): number {
  // Telegram's 429 retry_after is authoritative; if larger than our base,
  // honor it. Otherwise exp backoff: 60, 120, 240, 480, 960 + jitter.
  const base = 60 * Math.pow(2, Math.max(0, attempt - 1));
  const requested = retryAfterSec ? Math.max(retryAfterSec, base) : base;
  const jittered = requested + Math.floor(Math.random() * 30);
  return Math.min(jittered, BACKOFF_CAP_SEC);
}

/** Public entry point — called from cron + inline-kick. Iterates claim+send
 *  within budget. Best-effort: errors are recorded in last_error, not thrown. */
export async function flushTelegramOutbox(budgetMs: number = BUDGET_MS_DEFAULT): Promise<void> {
  const botToken = await getBotToken();
  if (!botToken) return; // nothing to flush if bot not configured

  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    const row = await claimOne();
    if (!row) return; // queue empty

    const result = await sendTelegramMessage(botToken, row.chat_id, row.body_text);

    if (result.kind === "ok") {
      await getDb()
        .prepare(`UPDATE telegram_outbox SET sent_at = unixepoch(), last_error = NULL WHERE id = ?`)
        .bind(row.id)
        .run();
      continue;
    }

    const nextAttempts = row.attempts + 1;
    const errMsg = `${result.status ?? ""} ${result.message}`.trim();

    if (result.kind === "permanent") {
      await getDb()
        .prepare(
          `UPDATE telegram_outbox
           SET failed_permanently_at = unixepoch(),
               attempts = ?,
               last_error = ?
           WHERE id = ?`,
        )
        .bind(nextAttempts, errMsg, row.id)
        .run();
      continue;
    }

    // Transient
    if (nextAttempts >= MAX_ATTEMPTS) {
      await getDb()
        .prepare(
          `UPDATE telegram_outbox
           SET failed_permanently_at = unixepoch(),
               attempts = ?,
               last_error = ?
           WHERE id = ?`,
        )
        .bind(nextAttempts, errMsg, row.id)
        .run();
      continue;
    }
    const delay = backoffSec(nextAttempts, result.retryAfterSec);
    await getDb()
      .prepare(
        `UPDATE telegram_outbox
         SET attempts = ?,
             next_attempt_at = unixepoch() + ?,
             last_error = ?
         WHERE id = ?`,
      )
      .bind(nextAttempts, delay, errMsg, row.id)
      .run();
  }
}
