// Lifecycle service for homepage_block_translations. Mirrors faq + service_block
// + testimonial siblings. Only translatable column is payload_json.

import { getDb } from "@/core/db/client";
import { auditLog } from "@/core/db/mutations";

import { applyTransition } from "./translations.transitions";
import { computeSourceHash } from "./translations.hash";
import type { TargetLocale } from "./translations.service";

export interface HomepageBlockTranslationRow {
  id: number;
  homepage_block_id: number;
  locale: TargetLocale;
  payload_json: string;
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

const HB_TRANS_COLUMNS = `id, homepage_block_id, locale, payload_json,
  status, stale_reason, source_locale, source_hash, source_snapshot, ai_generated_at,
  ai_model, prompt_version, reviewed_at, reviewed_by, in_flight_until, created_at, updated_at`;

export async function listHomepageBlockTranslationsForId(
  homepageBlockId: number,
): Promise<HomepageBlockTranslationRow[]> {
  const result = await getDb()
    .prepare(
      `SELECT ${HB_TRANS_COLUMNS} FROM homepage_block_translations
        WHERE homepage_block_id = ? ORDER BY locale`,
    )
    .bind(homepageBlockId)
    .all<HomepageBlockTranslationRow>();
  return result.results ?? [];
}

export async function listAllHomepageBlockTranslations(): Promise<HomepageBlockTranslationRow[]> {
  const result = await getDb()
    .prepare(
      `SELECT ${HB_TRANS_COLUMNS} FROM homepage_block_translations
        ORDER BY homepage_block_id, locale`,
    )
    .all<HomepageBlockTranslationRow>();
  return result.results ?? [];
}

export async function approveHomepageBlockTranslation(
  actorId: number,
  translationId: number,
): Promise<{ from: string; to: string }> {
  return applyTransition("homepage_block_translations", translationId, {
    kind: "operator_approved",
    userId: actorId,
  });
}

export async function editHomepageBlockTranslation(
  actorId: number,
  input: { id: number; payload_json: string },
): Promise<{ from: string; to: string }> {
  const now = Math.floor(Date.now() / 1000);
  const before = await getDb()
    .prepare(`SELECT ${HB_TRANS_COLUMNS} FROM homepage_block_translations WHERE id = ? LIMIT 1`)
    .bind(input.id)
    .first<HomepageBlockTranslationRow>();
  if (!before) {
    throw Object.assign(new Error("Translation không tồn tại."), { statusCode: 404 });
  }

  await getDb()
    .prepare(
      `UPDATE homepage_block_translations
          SET payload_json = ?, updated_at = ?
        WHERE id = ?`,
    )
    .bind(input.payload_json, now, input.id)
    .run();

  await auditLog(
    actorId,
    "update",
    "homepage_block_translations",
    input.id,
    { payload_json: before.payload_json },
    { payload_json: input.payload_json },
  );

  return applyTransition("homepage_block_translations", input.id, {
    kind: "operator_edited",
    userId: actorId,
  });
}

export async function markHomepageBlockTranslationStale(
  actorId: number,
  translationId: number,
): Promise<{ from: string; to: string }> {
  return applyTransition("homepage_block_translations", translationId, {
    kind: "manual_mark_stale",
    userId: actorId,
  });
}

export async function deleteHomepageBlockTranslation(actorId: number, id: number): Promise<void> {
  const before = await getDb()
    .prepare(`SELECT ${HB_TRANS_COLUMNS} FROM homepage_block_translations WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<HomepageBlockTranslationRow>();
  if (!before) return;
  await getDb()
    .prepare(`DELETE FROM homepage_block_translations WHERE id = ?`)
    .bind(id)
    .run();
  await auditLog(actorId, "delete", "homepage_block_translations", id, before, null);
}

export async function onHomepageBlockSourceChanged(
  homepageBlockId: number,
  newSource: { payload_json: string },
): Promise<{ stale_count: number }> {
  const newHash = await computeSourceHash({ payload_json: newSource.payload_json });
  const rows = await getDb()
    .prepare(
      `SELECT id, source_hash, status FROM homepage_block_translations
        WHERE homepage_block_id = ?`,
    )
    .bind(homepageBlockId)
    .all<{ id: number; source_hash: string; status: string }>();
  let staleCount = 0;
  for (const row of rows.results ?? []) {
    if (row.source_hash === newHash) continue;
    try {
      await applyTransition("homepage_block_translations", row.id, { kind: "source_changed" });
      staleCount += 1;
    } catch {
      // failed row or other invalid transition — leave it as-is
    }
  }
  return { stale_count: staleCount };
}
