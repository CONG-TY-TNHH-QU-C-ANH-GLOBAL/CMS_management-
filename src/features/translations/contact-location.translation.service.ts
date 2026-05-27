// Lifecycle service for contact_location_translations.
//
// Translatable fields per the contact_locations shape:
//   - label    (text, required)
//   - address  (text, nullable)

import { getDb } from "@/core/db/client";
import { auditLog } from "@/core/db/mutations";

import { applyTransition } from "./translations.transitions";
import { computeSourceHash } from "./translations.hash";
import type { TargetLocale } from "./translations.service";

export interface ContactLocationTranslationRow {
  id: number;
  contact_location_id: number;
  locale: TargetLocale;
  label: string;
  address: string | null;
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

const CL_TRANS_COLUMNS = `id, contact_location_id, locale, label, address,
  status, stale_reason, source_locale, source_hash, source_snapshot,
  ai_generated_at, ai_model, prompt_version, reviewed_at, reviewed_by,
  in_flight_until, created_at, updated_at`;

export async function listContactLocationTranslationsForId(
  contactLocationId: number,
): Promise<ContactLocationTranslationRow[]> {
  const result = await getDb()
    .prepare(
      `SELECT ${CL_TRANS_COLUMNS} FROM contact_location_translations
        WHERE contact_location_id = ? ORDER BY locale`,
    )
    .bind(contactLocationId)
    .all<ContactLocationTranslationRow>();
  return result.results ?? [];
}

export async function listAllContactLocationTranslations(): Promise<ContactLocationTranslationRow[]> {
  const result = await getDb()
    .prepare(
      `SELECT ${CL_TRANS_COLUMNS} FROM contact_location_translations
        ORDER BY contact_location_id, locale`,
    )
    .all<ContactLocationTranslationRow>();
  return result.results ?? [];
}

export async function approveContactLocationTranslation(
  actorId: number,
  translationId: number,
): Promise<{ from: string; to: string }> {
  return applyTransition("contact_location_translations", translationId, {
    kind: "operator_approved",
    userId: actorId,
  });
}

export interface ContactLocationEditInput {
  id: number;
  label: string;
  address: string | null;
}

export async function editContactLocationTranslation(
  actorId: number,
  input: ContactLocationEditInput,
): Promise<{ from: string; to: string }> {
  const now = Math.floor(Date.now() / 1000);
  const before = await getDb()
    .prepare(`SELECT ${CL_TRANS_COLUMNS} FROM contact_location_translations WHERE id = ? LIMIT 1`)
    .bind(input.id)
    .first<ContactLocationTranslationRow>();
  if (!before) {
    throw Object.assign(new Error("Translation không tồn tại."), { statusCode: 404 });
  }

  await getDb()
    .prepare(
      `UPDATE contact_location_translations
          SET label = ?, address = ?, updated_at = ?
        WHERE id = ?`,
    )
    .bind(input.label, input.address, now, input.id)
    .run();

  await auditLog(
    actorId,
    "update",
    "contact_location_translations",
    input.id,
    { label: before.label, address: before.address },
    { label: input.label, address: input.address },
  );

  return applyTransition("contact_location_translations", input.id, {
    kind: "operator_edited",
    userId: actorId,
  });
}

export async function markContactLocationTranslationStale(
  actorId: number,
  translationId: number,
): Promise<{ from: string; to: string }> {
  return applyTransition("contact_location_translations", translationId, {
    kind: "manual_mark_stale",
    userId: actorId,
  });
}

export async function deleteContactLocationTranslation(actorId: number, id: number): Promise<void> {
  const before = await getDb()
    .prepare(`SELECT ${CL_TRANS_COLUMNS} FROM contact_location_translations WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<ContactLocationTranslationRow>();
  if (!before) return;
  await getDb()
    .prepare(`DELETE FROM contact_location_translations WHERE id = ?`)
    .bind(id)
    .run();
  await auditLog(actorId, "delete", "contact_location_translations", id, before, null);
}

export async function onContactLocationSourceChanged(
  contactLocationId: number,
  newSource: { label: string; address: string | null },
): Promise<{ stale_count: number }> {
  const newHash = await computeSourceHash({
    label: newSource.label,
    address: newSource.address ?? "",
  });
  const rows = await getDb()
    .prepare(
      `SELECT id, source_hash, status FROM contact_location_translations
        WHERE contact_location_id = ?`,
    )
    .bind(contactLocationId)
    .all<{ id: number; source_hash: string; status: string }>();
  let staleCount = 0;
  for (const row of rows.results ?? []) {
    if (row.source_hash === newHash) continue;
    try {
      await applyTransition("contact_location_translations", row.id, { kind: "source_changed" });
      staleCount += 1;
    } catch {
      // failed row or other invalid transition — leave it as-is
    }
  }
  return { stale_count: staleCount };
}
