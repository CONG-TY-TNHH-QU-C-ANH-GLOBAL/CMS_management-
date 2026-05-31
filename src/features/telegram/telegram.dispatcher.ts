// Single entry point for emitting an event to Telegram.
//
// Flow:
//   1. Look up subscriptions for the event_type (joined with non-paused channels).
//   2. Format the body via formatEvent() (one HTML string, reused per channel).
//   3. INSERT one telegram_outbox row per (channel, event_type) — durable.
//      A unique index on idempotency_key collapses duplicate emits.
//   4. Inline-kick flushTelegramOutbox with a small budget so a successful
//      send arrives in ~1s. Anything that doesn't complete inline falls
//      through to the cron worker that runs every minute.
//
// Best-effort by construction: callers wrap in try/catch so a Telegram outage
// never breaks a user-facing request (lead POST etc.).

import { getDb } from "@/core/db/client";
import type { DispatchInput } from "./telegram.events";
import { formatEvent } from "./telegram.formatters";
import { flushTelegramOutbox } from "./telegram.outbox";

const INLINE_FLUSH_BUDGET_MS = 5_000;

interface SubscriberRow {
  channel_id: number;
  chat_id: string;
}

/** Emit an event. Returns the number of outbox rows enqueued (0 if no
 *  subscribers or duplicate idempotency_key). */
export async function dispatchEvent(input: DispatchInput): Promise<number> {
  // 1. Find target channels for this event_type.
  const subs = await getDb()
    .prepare(
      `SELECT s.channel_id AS channel_id, c.chat_id AS chat_id
       FROM telegram_subscriptions s
       JOIN telegram_channels c ON c.id = s.channel_id
       WHERE s.event_type = ? AND s.enabled = 1 AND c.paused = 0`,
    )
    .bind(input.event_type)
    .all<SubscriberRow>();
  const targets = subs.results ?? [];
  if (targets.length === 0) {
    console.warn(`[telegram] dispatchEvent(${input.event_type}): no enabled subscribers (check matrix + channel.paused)`);
    return 0;
  }

  // 2. One body per emit (same content across channels).
  const bodyText = formatEvent(input);
  const baseIdempotency = input.idempotency_key ?? null;

  // 3. Enqueue — one row per target. Idempotency key is per-channel so
  //    two distinct channels both get the message (only same-channel dup
  //    collapses).
  let enqueued = 0;
  for (const t of targets) {
    const idempKey = baseIdempotency ? `${baseIdempotency}:${t.channel_id}` : null;
    try {
      const res = await getDb()
        .prepare(
          `INSERT INTO telegram_outbox
             (event_type, channel_id, chat_id, body_text, idempotency_key, next_attempt_at)
           VALUES (?, ?, ?, ?, ?, unixepoch())`,
        )
        .bind(input.event_type, t.channel_id, t.chat_id, bodyText, idempKey)
        .run();
      const changes = (res.meta as { changes?: number; rows_written?: number } | undefined)?.changes
        ?? (res.meta as { rows_written?: number } | undefined)?.rows_written
        ?? 0;
      if (changes >= 1) enqueued += 1;
    } catch (e) {
      // UNIQUE(idempotency_key) violation = expected dedup path, swallow.
      // Any OTHER error (schema drift, missing table) should be visible.
      const msg = e instanceof Error ? e.message : String(e);
      if (!/UNIQUE/i.test(msg)) {
        console.error(`[telegram] outbox INSERT failed for ${input.event_type} → channel ${t.channel_id}:`, e);
      }
    }
  }

  // 4. Inline-kick. Bounded so a stuck Telegram doesn't hold the request
  //    indefinitely. Anything not flushed inline runs via cron ≤ 60s later.
  if (enqueued > 0) {
    try {
      await flushTelegramOutbox(INLINE_FLUSH_BUDGET_MS);
    } catch {
      // Outbox is already durable — caller doesn't need to know.
    }
  }
  return enqueued;
}
