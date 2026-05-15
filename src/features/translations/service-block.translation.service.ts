// Lifecycle service for service_block_translations. Mirrors faq.translation.service
// — see that file for design notes. All status mutations go through applyTransition().
//
// Translatable fields per the service_blocks shape:
//   - title          (nullable text)
//   - description    (nullable text)
//   - payload_json   (JSON; kind-specific localized extras)

import { getDb } from "@/core/db/client";
import { auditLog } from "@/core/db/mutations";

import { applyTransition } from "./translations.transitions";
import { computeSourceHash } from "./translations.hash";
import type { TargetLocale } from "./translations.service";

export interface ServiceBlockTranslationRow {
  id: number;
  service_block_id: number;
  locale: TargetLocale;
  title: string | null;
  description: string | null;
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

const SB_TRANS_COLUMNS = `id, service_block_id, locale, title, description, payload_json,
  status, stale_reason, source_locale, source_hash, source_snapshot, ai_generated_at,
  ai_model, prompt_version, reviewed_at, reviewed_by, in_flight_until, created_at, updated_at`;

export async function listServiceBlockTranslationsForId(
  serviceBlockId: number,
): Promise<ServiceBlockTranslationRow[]> {
  const result = await getDb()
    .prepare(
      `SELECT ${SB_TRANS_COLUMNS} FROM service_block_translations
        WHERE service_block_id = ? ORDER BY locale`,
    )
    .bind(serviceBlockId)
    .all<ServiceBlockTranslationRow>();
  return result.results ?? [];
}

export async function listAllServiceBlockTranslations(): Promise<ServiceBlockTranslationRow[]> {
  const result = await getDb()
    .prepare(
      `SELECT ${SB_TRANS_COLUMNS} FROM service_block_translations
        ORDER BY service_block_id, locale`,
    )
    .all<ServiceBlockTranslationRow>();
  return result.results ?? [];
}

export async function approveServiceBlockTranslation(
  actorId: number,
  translationId: number,
): Promise<{ from: string; to: string }> {
  return applyTransition("service_block_translations", translationId, {
    kind: "operator_approved",
    userId: actorId,
  });
}

export async function editServiceBlockTranslation(
  actorId: number,
  input: { id: number; title: string | null; description: string | null; payload_json: string },
): Promise<{ from: string; to: string }> {
  const now = Math.floor(Date.now() / 1000);
  const before = await getDb()
    .prepare(`SELECT ${SB_TRANS_COLUMNS} FROM service_block_translations WHERE id = ? LIMIT 1`)
    .bind(input.id)
    .first<ServiceBlockTranslationRow>();
  if (!before) {
    throw Object.assign(new Error("Translation không tồn tại."), { statusCode: 404 });
  }

  await getDb()
    .prepare(
      `UPDATE service_block_translations
          SET title = ?, description = ?, payload_json = ?, updated_at = ?
        WHERE id = ?`,
    )
    .bind(input.title, input.description, input.payload_json, now, input.id)
    .run();

  await auditLog(
    actorId,
    "update",
    "service_block_translations",
    input.id,
    { title: before.title, description: before.description, payload_json: before.payload_json },
    { title: input.title, description: input.description, payload_json: input.payload_json },
  );

  return applyTransition("service_block_translations", input.id, {
    kind: "operator_edited",
    userId: actorId,
  });
}

export async function markServiceBlockTranslationStale(
  actorId: number,
  translationId: number,
): Promise<{ from: string; to: string }> {
  return applyTransition("service_block_translations", translationId, {
    kind: "manual_mark_stale",
    userId: actorId,
  });
}

export async function deleteServiceBlockTranslation(actorId: number, id: number): Promise<void> {
  const before = await getDb()
    .prepare(`SELECT ${SB_TRANS_COLUMNS} FROM service_block_translations WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<ServiceBlockTranslationRow>();
  if (!before) return;
  await getDb()
    .prepare(`DELETE FROM service_block_translations WHERE id = ?`)
    .bind(id)
    .run();
  await auditLog(actorId, "delete", "service_block_translations", id, before, null);
}

/** Called from the service_blocks update handler when the VI source row
 *  changes. Auto-fires `source_changed` on dependent translations whose
 *  hash differs (spec §3.3 + §11.7). */
export async function onServiceBlockSourceChanged(
  serviceBlockId: number,
  newSource: { title: string | null; description: string | null; payload_json: string },
): Promise<{ stale_count: number }> {
  const newHash = await computeSourceHash({
    title: newSource.title ?? "",
    description: newSource.description ?? "",
    payload_json: newSource.payload_json,
  });
  const rows = await getDb()
    .prepare(
      `SELECT id, source_hash, status FROM service_block_translations
        WHERE service_block_id = ?`,
    )
    .bind(serviceBlockId)
    .all<{ id: number; source_hash: string; status: string }>();
  let staleCount = 0;
  for (const row of rows.results ?? []) {
    if (row.source_hash === newHash) continue;
    try {
      await applyTransition("service_block_translations", row.id, { kind: "source_changed" });
      staleCount += 1;
    } catch {
      // failed row or other invalid transition — leave it as-is
    }
  }
  return { stale_count: staleCount };
}
