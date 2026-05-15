// Lifecycle service for testimonial_translations. Mirrors faq.translation.service.
// Only `quote` and `author_role` are translatable; `author_name` and
// `avatar_media_id` stay on the source row (proper-noun + binary asset).

import { getDb } from "@/core/db/client";
import { auditLog } from "@/core/db/mutations";

import { applyTransition } from "./translations.transitions";
import { computeSourceHash } from "./translations.hash";
import type { TargetLocale } from "./translations.service";

export interface TestimonialTranslationRow {
  id: number;
  testimonial_id: number;
  locale: TargetLocale;
  quote: string;
  author_role: string | null;
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

const TEST_TRANS_COLUMNS = `id, testimonial_id, locale, quote, author_role,
  status, stale_reason, source_locale, source_hash, source_snapshot, ai_generated_at,
  ai_model, prompt_version, reviewed_at, reviewed_by, in_flight_until, created_at, updated_at`;

export async function listTestimonialTranslationsForId(
  testimonialId: number,
): Promise<TestimonialTranslationRow[]> {
  const result = await getDb()
    .prepare(
      `SELECT ${TEST_TRANS_COLUMNS} FROM testimonial_translations
        WHERE testimonial_id = ? ORDER BY locale`,
    )
    .bind(testimonialId)
    .all<TestimonialTranslationRow>();
  return result.results ?? [];
}

export async function listAllTestimonialTranslations(): Promise<TestimonialTranslationRow[]> {
  const result = await getDb()
    .prepare(
      `SELECT ${TEST_TRANS_COLUMNS} FROM testimonial_translations
        ORDER BY testimonial_id, locale`,
    )
    .all<TestimonialTranslationRow>();
  return result.results ?? [];
}

export async function approveTestimonialTranslation(
  actorId: number,
  translationId: number,
): Promise<{ from: string; to: string }> {
  return applyTransition("testimonial_translations", translationId, {
    kind: "operator_approved",
    userId: actorId,
  });
}

export async function editTestimonialTranslation(
  actorId: number,
  input: { id: number; quote: string; author_role: string | null },
): Promise<{ from: string; to: string }> {
  const now = Math.floor(Date.now() / 1000);
  const before = await getDb()
    .prepare(`SELECT ${TEST_TRANS_COLUMNS} FROM testimonial_translations WHERE id = ? LIMIT 1`)
    .bind(input.id)
    .first<TestimonialTranslationRow>();
  if (!before) {
    throw Object.assign(new Error("Translation không tồn tại."), { statusCode: 404 });
  }

  await getDb()
    .prepare(
      `UPDATE testimonial_translations
          SET quote = ?, author_role = ?, updated_at = ?
        WHERE id = ?`,
    )
    .bind(input.quote, input.author_role, now, input.id)
    .run();

  await auditLog(
    actorId,
    "update",
    "testimonial_translations",
    input.id,
    { quote: before.quote, author_role: before.author_role },
    { quote: input.quote, author_role: input.author_role },
  );

  return applyTransition("testimonial_translations", input.id, {
    kind: "operator_edited",
    userId: actorId,
  });
}

export async function markTestimonialTranslationStale(
  actorId: number,
  translationId: number,
): Promise<{ from: string; to: string }> {
  return applyTransition("testimonial_translations", translationId, {
    kind: "manual_mark_stale",
    userId: actorId,
  });
}

export async function deleteTestimonialTranslation(actorId: number, id: number): Promise<void> {
  const before = await getDb()
    .prepare(`SELECT ${TEST_TRANS_COLUMNS} FROM testimonial_translations WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<TestimonialTranslationRow>();
  if (!before) return;
  await getDb()
    .prepare(`DELETE FROM testimonial_translations WHERE id = ?`)
    .bind(id)
    .run();
  await auditLog(actorId, "delete", "testimonial_translations", id, before, null);
}

export async function onTestimonialSourceChanged(
  testimonialId: number,
  newSource: { quote: string; author_role: string | null },
): Promise<{ stale_count: number }> {
  const newHash = await computeSourceHash({
    quote: newSource.quote,
    author_role: newSource.author_role ?? "",
  });
  const rows = await getDb()
    .prepare(
      `SELECT id, source_hash, status FROM testimonial_translations
        WHERE testimonial_id = ?`,
    )
    .bind(testimonialId)
    .all<{ id: number; source_hash: string; status: string }>();
  let staleCount = 0;
  for (const row of rows.results ?? []) {
    if (row.source_hash === newHash) continue;
    try {
      await applyTransition("testimonial_translations", row.id, { kind: "source_changed" });
      staleCount += 1;
    } catch {
      // failed row or other invalid transition — leave it as-is
    }
  }
  return { stale_count: staleCount };
}
