// Lifecycle service for shipping_route_translations.
//
// Translatable fields (top-level): title, body_md, notes_json.
// Nested shipping_route_tables NOT translated yet — separate follow-up.

import { getDb } from "@/core/db/client";
import { auditLog } from "@/core/db/mutations";

import { applyTransition } from "./translations.transitions";
import { computeSourceHash } from "./translations.hash";
import type { TargetLocale } from "./translations.service";

export interface ShippingRouteTranslationRow {
  id: number;
  shipping_route_id: number;
  locale: TargetLocale;
  title: string;
  body_md: string | null;
  notes_json: string | null;
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

const SR_TRANS_COLUMNS = `id, shipping_route_id, locale, title, body_md, notes_json,
  status, stale_reason, source_locale, source_hash, source_snapshot,
  ai_generated_at, ai_model, prompt_version, reviewed_at, reviewed_by,
  in_flight_until, created_at, updated_at`;

export async function listShippingRouteTranslationsForId(
  shippingRouteId: number,
): Promise<ShippingRouteTranslationRow[]> {
  const result = await getDb()
    .prepare(
      `SELECT ${SR_TRANS_COLUMNS} FROM shipping_route_translations
        WHERE shipping_route_id = ? ORDER BY locale`,
    )
    .bind(shippingRouteId)
    .all<ShippingRouteTranslationRow>();
  return result.results ?? [];
}

export async function listAllShippingRouteTranslations(): Promise<ShippingRouteTranslationRow[]> {
  const result = await getDb()
    .prepare(
      `SELECT ${SR_TRANS_COLUMNS} FROM shipping_route_translations
        ORDER BY shipping_route_id, locale`,
    )
    .all<ShippingRouteTranslationRow>();
  return result.results ?? [];
}

export async function approveShippingRouteTranslation(
  actorId: number,
  translationId: number,
): Promise<{ from: string; to: string }> {
  return applyTransition("shipping_route_translations", translationId, {
    kind: "operator_approved",
    userId: actorId,
  });
}

export interface ShippingRouteEditInput {
  id: number;
  title: string;
  body_md: string | null;
  notes_json: string | null;
}

export async function editShippingRouteTranslation(
  actorId: number,
  input: ShippingRouteEditInput,
): Promise<{ from: string; to: string }> {
  const now = Math.floor(Date.now() / 1000);
  const before = await getDb()
    .prepare(`SELECT ${SR_TRANS_COLUMNS} FROM shipping_route_translations WHERE id = ? LIMIT 1`)
    .bind(input.id)
    .first<ShippingRouteTranslationRow>();
  if (!before) {
    throw Object.assign(new Error("Translation không tồn tại."), { statusCode: 404 });
  }

  await getDb()
    .prepare(
      `UPDATE shipping_route_translations
          SET title = ?, body_md = ?, notes_json = ?, updated_at = ?
        WHERE id = ?`,
    )
    .bind(input.title, input.body_md, input.notes_json, now, input.id)
    .run();

  await auditLog(
    actorId,
    "update",
    "shipping_route_translations",
    input.id,
    { title: before.title, body_md: before.body_md, notes_json: before.notes_json },
    { title: input.title, body_md: input.body_md, notes_json: input.notes_json },
  );

  return applyTransition("shipping_route_translations", input.id, {
    kind: "operator_edited",
    userId: actorId,
  });
}

export async function markShippingRouteTranslationStale(
  actorId: number,
  translationId: number,
): Promise<{ from: string; to: string }> {
  return applyTransition("shipping_route_translations", translationId, {
    kind: "manual_mark_stale",
    userId: actorId,
  });
}

export async function deleteShippingRouteTranslation(actorId: number, id: number): Promise<void> {
  const before = await getDb()
    .prepare(`SELECT ${SR_TRANS_COLUMNS} FROM shipping_route_translations WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<ShippingRouteTranslationRow>();
  if (!before) return;
  await getDb()
    .prepare(`DELETE FROM shipping_route_translations WHERE id = ?`)
    .bind(id)
    .run();
  await auditLog(actorId, "delete", "shipping_route_translations", id, before, null);
}

export async function onShippingRouteSourceChanged(
  shippingRouteId: number,
  newSource: { title: string; body_md: string | null; notes_json: string | null },
): Promise<{ stale_count: number }> {
  const newHash = await computeSourceHash({
    title: newSource.title,
    body_md: newSource.body_md ?? "",
    notes_json: newSource.notes_json ?? "",
  });
  const rows = await getDb()
    .prepare(
      `SELECT id, source_hash, status FROM shipping_route_translations
        WHERE shipping_route_id = ?`,
    )
    .bind(shippingRouteId)
    .all<{ id: number; source_hash: string; status: string }>();
  let staleCount = 0;
  for (const row of rows.results ?? []) {
    if (row.source_hash === newHash) continue;
    try {
      await applyTransition("shipping_route_translations", row.id, { kind: "source_changed" });
      staleCount += 1;
    } catch {
      // failed row or other invalid transition — leave it as-is
    }
  }
  return { stale_count: staleCount };
}
