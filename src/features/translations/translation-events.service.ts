// A9 — translation lifecycle event log. Append-only, best-effort (never throws
// into the caller). Used by both the in-place translate() pipeline and the
// async job-queue engine to record a traceable timeline per entity.

import { getDb } from "@/core/db/client";

export interface TranslationEventInput {
  jobId?: number | null;
  entityType: string;
  entityRef: string; // entity id (as text) or slug
  locale?: string | null;
  event: string;
  detail?: Record<string, unknown> | null;
}

export async function emitTranslationEvent(input: TranslationEventInput): Promise<void> {
  try {
    await getDb()
      .prepare(
        `INSERT INTO translation_job_events (job_id, entity_type, entity_ref, locale, event, detail_json)
           VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.jobId ?? null,
        input.entityType,
        input.entityRef,
        input.locale ?? null,
        input.event,
        input.detail ? JSON.stringify(input.detail).slice(0, 4000) : null,
      )
      .run();
  } catch (err) {
    // Observability must never break the operation it observes.
    console.error("[translation-events] emit failed", err);
  }
}

export interface TranslationEventRow {
  id: number;
  job_id: number | null;
  entity_type: string;
  entity_ref: string;
  locale: string | null;
  event: string;
  detail_json: string | null;
  created_at: number;
}

/** Recent events for one entity — admin timeline / forensics. */
export async function listTranslationEventsForEntity(
  entityType: string,
  entityRef: string,
  limit = 50,
): Promise<TranslationEventRow[]> {
  const res = await getDb()
    .prepare(
      `SELECT * FROM translation_job_events
        WHERE entity_type = ? AND entity_ref = ?
        ORDER BY id DESC LIMIT ?`,
    )
    .bind(entityType, entityRef, Math.max(1, Math.min(200, limit)))
    .all<TranslationEventRow>();
  return res.results ?? [];
}
