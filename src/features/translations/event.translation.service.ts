// Lifecycle service for event_translations. Mirrors blog-post.translation.service
// field for field — `events` has the same localization shape as `blog_posts`
// (one row per locale keyed by slug+locale, `vi` canonical), so the same staging
// + review model applies. All status mutations go through applyTransition.
//
// Translatable fields per the events shape:
//   - title              (text, required)
//   - summary            (text, nullable)
//   - body_md            (markdown, nullable)
//   - location           (text, nullable — prose, see migration 0051)
//   - role               (text, nullable — "Diễn giả" must reach an English
//                         reader as "Speaker")
//   - seo_title          (text, nullable)
//   - seo_description    (text, nullable)

import { getDb } from "@/core/db/client";
import { auditLog } from "@/core/db/mutations";

import { applyTransition } from "./translations.transitions";
import { computeSourceHash } from "./translations.hash";
import type { TargetLocale } from "./translations.service";

export interface EventTranslationRow {
  id: number;
  event_id: number;
  locale: TargetLocale;
  title: string;
  summary: string | null;
  body_md: string | null;
  location: string | null;
  role: string | null;
  seo_title: string | null;
  seo_description: string | null;
  status: "draft" | "reviewed" | "stale" | "failed";
  stale_reason: string | null;
  source_locale: string;
  source_hash: string;
  source_snapshot: string | null;
  ai_generated_at: number | null;
  ai_model: string | null;
  prompt_version: string | null;
  reviewed_at: number | null;
  reviewed_by: number | null;
  in_flight_until: number | null;
  created_at: number;
  updated_at: number;
}

const EV_TRANS_COLUMNS = `id, event_id, locale, title, summary, body_md, location, role,
  seo_title, seo_description, status, stale_reason, source_locale, source_hash,
  source_snapshot, ai_generated_at, ai_model, prompt_version, reviewed_at,
  reviewed_by, in_flight_until, created_at, updated_at`;

/** The prose fields, in the order the source hash and the OpenAI payload use.
 *  Kept next to the SQL so a field added to one cannot be forgotten in the other. */
const TRANSLATABLE = [
  "title",
  "summary",
  "body_md",
  "location",
  "role",
  "seo_title",
  "seo_description",
] as const;

export async function listEventTranslationsForId(eventId: number): Promise<EventTranslationRow[]> {
  const result = await getDb()
    .prepare(
      `SELECT ${EV_TRANS_COLUMNS} FROM event_translations
        WHERE event_id = ? ORDER BY locale`,
    )
    .bind(eventId)
    .all<EventTranslationRow>();
  return result.results ?? [];
}

export async function listAllEventTranslations(): Promise<EventTranslationRow[]> {
  const result = await getDb()
    .prepare(`SELECT ${EV_TRANS_COLUMNS} FROM event_translations ORDER BY event_id, locale`)
    .all<EventTranslationRow>();
  return result.results ?? [];
}

export async function approveEventTranslation(
  actorId: number,
  translationId: number,
): Promise<{ from: string; to: string }> {
  return applyTransition("event_translations", translationId, {
    kind: "operator_approved",
    userId: actorId,
  });
}

export interface EventTranslationEditInput {
  id: number;
  title: string;
  summary: string | null;
  body_md: string | null;
  location: string | null;
  role: string | null;
  seo_title: string | null;
  seo_description: string | null;
}

export async function editEventTranslation(
  actorId: number,
  input: EventTranslationEditInput,
): Promise<{ from: string; to: string }> {
  const now = Math.floor(Date.now() / 1000);
  const before = await getDb()
    .prepare(`SELECT ${EV_TRANS_COLUMNS} FROM event_translations WHERE id = ? LIMIT 1`)
    .bind(input.id)
    .first<EventTranslationRow>();
  if (!before) {
    throw Object.assign(new Error("Translation không tồn tại."), { statusCode: 404 });
  }

  await getDb()
    .prepare(
      `UPDATE event_translations
          SET title = ?, summary = ?, body_md = ?, location = ?, role = ?,
              seo_title = ?, seo_description = ?, updated_at = ?
        WHERE id = ?`,
    )
    .bind(
      input.title,
      input.summary,
      input.body_md,
      input.location,
      input.role,
      input.seo_title,
      input.seo_description,
      now,
      input.id,
    )
    .run();

  const pick = (row: Record<string, unknown>) =>
    Object.fromEntries(TRANSLATABLE.map((key) => [key, row[key] ?? null]));

  await auditLog(
    actorId,
    "update",
    "event_translations",
    input.id,
    pick(before as unknown as Record<string, unknown>),
    pick(input as unknown as Record<string, unknown>),
  );

  return applyTransition("event_translations", input.id, {
    kind: "operator_edited",
    userId: actorId,
  });
}

export async function markEventTranslationStale(
  actorId: number,
  translationId: number,
): Promise<{ from: string; to: string }> {
  return applyTransition("event_translations", translationId, {
    kind: "manual_mark_stale",
    userId: actorId,
  });
}

export async function deleteEventTranslation(actorId: number, id: number): Promise<void> {
  const before = await getDb()
    .prepare(`SELECT ${EV_TRANS_COLUMNS} FROM event_translations WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<EventTranslationRow>();
  if (!before) return;
  await getDb().prepare(`DELETE FROM event_translations WHERE id = ?`).bind(id).run();
  await auditLog(actorId, "delete", "event_translations", id, before, null);
}

/** Called after the VI row is edited: any translation whose recorded source
 *  hash no longer matches the new source text is marked stale, so the review
 *  queue shows it needs redoing rather than silently serving old copy. */
export async function onEventSourceChanged(
  eventId: number,
  newSource: Record<(typeof TRANSLATABLE)[number], string | null>,
): Promise<{ stale_count: number }> {
  const newHash = await computeSourceHash(
    Object.fromEntries(TRANSLATABLE.map((key) => [key, newSource[key] ?? ""])),
  );
  const rows = await getDb()
    .prepare(`SELECT id, source_hash, status FROM event_translations WHERE event_id = ?`)
    .bind(eventId)
    .all<{ id: number; source_hash: string; status: string }>();
  let staleCount = 0;
  for (const row of rows.results ?? []) {
    if (row.source_hash === newHash) continue;
    try {
      await applyTransition("event_translations", row.id, { kind: "source_changed" });
      staleCount += 1;
    } catch {
      // Already stale or in a terminal state — not an error, nothing to redo.
    }
  }
  return { stale_count: staleCount };
}
