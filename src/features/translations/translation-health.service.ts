// A10 — OpenAI provider circuit breaker. Tracks consecutive transient failures
// (429/quota/5xx/timeout). When they exceed a threshold the breaker trips to
// 'paused' for a cooldown so translate()/the engine short-circuit instead of
// hammering a degraded API. Auto-resumes (half-open) after the cooldown.
//
// Only TRANSIENT provider failures count toward tripping — content failures
// (parse error, structural reject) are not the provider's fault and must not
// pause translation.

import { getDb } from "@/core/db/client";
import { emitTranslationEvent } from "./translation-events.service";

const PROVIDER = "openai";
// Trip after this many consecutive transient failures.
const FAILURE_THRESHOLD = 5;
// How long to stay paused before a half-open retry.
const COOLDOWN_SEC = 300;

export type ProviderState = "healthy" | "degraded" | "paused";

export interface ProviderHealthRow {
  provider: string;
  state: ProviderState;
  consecutive_failures: number;
  paused_until: number | null;
  last_error: string | null;
  updated_at: number;
}

async function readRow(): Promise<ProviderHealthRow | null> {
  const row = await getDb()
    .prepare(`SELECT * FROM translation_provider_health WHERE provider = ? LIMIT 1`)
    .bind(PROVIDER)
    .first<ProviderHealthRow>();
  return row ?? null;
}

export interface PausedCheck {
  paused: boolean;
  until: number | null;
}

/** Is the provider currently paused? Auto-resumes (half-open) once the cooldown
 *  has elapsed, emitting a provider_resumed event. Best-effort — on any error
 *  it reports "not paused" so translation is never blocked by the breaker
 *  itself failing. */
export async function isProviderPaused(): Promise<PausedCheck> {
  try {
    const row = await readRow();
    if (!row || row.state !== "paused") return { paused: false, until: null };
    const now = Math.floor(Date.now() / 1000);
    if (row.paused_until && row.paused_until > now) {
      return { paused: true, until: row.paused_until };
    }
    // Cooldown elapsed → half-open: allow the next call through.
    await getDb()
      .prepare(
        `UPDATE translation_provider_health
            SET state = 'degraded', consecutive_failures = 0, paused_until = NULL, updated_at = unixepoch()
          WHERE provider = ?`,
      )
      .bind(PROVIDER)
      .run();
    await emitTranslationEvent({
      entityType: "provider",
      entityRef: PROVIDER,
      event: "provider_resumed",
      detail: { from: "paused" },
    });
    return { paused: false, until: null };
  } catch (err) {
    console.error("[translation-health] isProviderPaused failed", err);
    return { paused: false, until: null };
  }
}

/** Record a transient provider failure. Trips the breaker to 'paused' when the
 *  consecutive count crosses the threshold. */
export async function recordProviderFailure(errorMsg: string): Promise<void> {
  try {
    const row = await readRow();
    const failures = (row?.consecutive_failures ?? 0) + 1;
    const now = Math.floor(Date.now() / 1000);
    if (failures >= FAILURE_THRESHOLD) {
      const pausedUntil = now + COOLDOWN_SEC;
      await getDb()
        .prepare(
          `UPDATE translation_provider_health
              SET state = 'paused', consecutive_failures = ?, paused_until = ?, last_error = ?, updated_at = unixepoch()
            WHERE provider = ?`,
        )
        .bind(failures, pausedUntil, errorMsg.slice(0, 500), PROVIDER)
        .run();
      await emitTranslationEvent({
        entityType: "provider",
        entityRef: PROVIDER,
        event: "provider_paused",
        detail: { consecutive_failures: failures, paused_until: pausedUntil, last_error: errorMsg.slice(0, 200) },
      });
    } else {
      await getDb()
        .prepare(
          `UPDATE translation_provider_health
              SET state = 'degraded', consecutive_failures = ?, last_error = ?, updated_at = unixepoch()
            WHERE provider = ?`,
        )
        .bind(failures, errorMsg.slice(0, 500), PROVIDER)
        .run();
    }
  } catch (err) {
    console.error("[translation-health] recordProviderFailure failed", err);
  }
}

/** Record a successful provider call — resets the failure counter to healthy. */
export async function recordProviderSuccess(): Promise<void> {
  try {
    await getDb()
      .prepare(
        `UPDATE translation_provider_health
            SET state = 'healthy', consecutive_failures = 0, paused_until = NULL, updated_at = unixepoch()
          WHERE provider = ? AND (state != 'healthy' OR consecutive_failures != 0)`,
      )
      .bind(PROVIDER)
      .run();
  } catch (err) {
    console.error("[translation-health] recordProviderSuccess failed", err);
  }
}

export async function getProviderHealth(): Promise<ProviderHealthRow | null> {
  return readRow();
}
