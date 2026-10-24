// Lifecycle service for campaign_translations (migration 0062). Same staging +
// review model as event_translations; the SQL is built from one field list so
// the hash, the UPDATE and the audit diff cannot disagree about which columns
// are translated. All status changes go through applyTransition.

import { getDb } from "@/core/db/client";
import { auditLog } from "@/core/db/mutations";

import { applyTransition } from "./translations.transitions";
import { computeSourceHash } from "./translations.hash";
import type { TargetLocale } from "./translations.service";

const TABLE = "campaign_translations";

/** Order matches ENTITY_CONFIG.campaign.fieldColumns — the hash depends on it. */
export const CAMPAIGN_TRANSLATABLE = [
  "title",
  "summary",
  "body_md",
  "cta_label",
  "nav_label",
  "menu_items_json",
  "seo_title",
  "seo_description",
] as const;

type TranslatableField = (typeof CAMPAIGN_TRANSLATABLE)[number];

export type CampaignTranslationRow = {
  id: number;
  campaign_id: number;
  locale: TargetLocale;
  status: "draft" | "reviewed" | "stale" | "failed";
  stale_reason: string | null;
  source_hash: string;
  ai_generated_at: number | null;
  ai_model: string | null;
  reviewed_at: number | null;
  reviewed_by: number | null;
  updated_at: number;
} & Record<TranslatableField, string | null>;

const COLUMNS = `id, campaign_id, locale, ${CAMPAIGN_TRANSLATABLE.join(", ")}, status,
  stale_reason, source_hash, ai_generated_at, ai_model, reviewed_at, reviewed_by, updated_at`;

export type CampaignTranslationEditInput = { id: number } & Record<
  TranslatableField,
  string | null
>;

function pick(row: Record<string, unknown>) {
  return Object.fromEntries(CAMPAIGN_TRANSLATABLE.map((key) => [key, row[key] ?? null]));
}

async function getRow(id: number): Promise<CampaignTranslationRow | null> {
  return getDb()
    .prepare(`SELECT ${COLUMNS} FROM ${TABLE} WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<CampaignTranslationRow>();
}

export async function listCampaignTranslationsForId(
  campaignId: number,
): Promise<CampaignTranslationRow[]> {
  const result = await getDb()
    .prepare(`SELECT ${COLUMNS} FROM ${TABLE} WHERE campaign_id = ? ORDER BY locale`)
    .bind(campaignId)
    .all<CampaignTranslationRow>();
  return result.results ?? [];
}

export function approveCampaignTranslation(actorId: number, id: number) {
  return applyTransition(TABLE, id, { kind: "operator_approved", userId: actorId });
}

export function markCampaignTranslationStale(actorId: number, id: number) {
  return applyTransition(TABLE, id, { kind: "manual_mark_stale", userId: actorId });
}

export async function editCampaignTranslation(
  actorId: number,
  input: CampaignTranslationEditInput,
) {
  const before = await getRow(input.id);
  if (!before) throw Object.assign(new Error("Translation không tồn tại."), { statusCode: 404 });
  await getDb()
    .prepare(
      `UPDATE ${TABLE} SET ${CAMPAIGN_TRANSLATABLE.map((key) => `${key} = ?`).join(", ")},
         updated_at = unixepoch() WHERE id = ?`,
    )
    .bind(
      ...CAMPAIGN_TRANSLATABLE.map((key) =>
        key === "menu_items_json" ? (input[key] ?? "[]") : input[key],
      ),
      input.id,
    )
    .run();
  await auditLog(actorId, "update", TABLE, input.id, pick(before), pick(input));
  return applyTransition(TABLE, input.id, { kind: "operator_edited", userId: actorId });
}

export async function deleteCampaignTranslation(actorId: number, id: number): Promise<void> {
  const before = await getRow(id);
  if (!before) return;
  await getDb().prepare(`DELETE FROM ${TABLE} WHERE id = ?`).bind(id).run();
  await auditLog(actorId, "delete", TABLE, id, before, null);
}

/** After a VI edit: translations whose recorded source hash no longer matches
 *  are marked stale, so they stop being served and show up for review. */
export async function onCampaignSourceChanged(
  campaignId: number,
  source: Record<TranslatableField, string | null>,
): Promise<{ stale_count: number }> {
  const hash = await computeSourceHash(
    Object.fromEntries(CAMPAIGN_TRANSLATABLE.map((key) => [key, source[key] ?? ""])),
  );
  const rows = await getDb()
    .prepare(`SELECT id, source_hash FROM ${TABLE} WHERE campaign_id = ?`)
    .bind(campaignId)
    .all<{ id: number; source_hash: string }>();
  let staleCount = 0;
  for (const row of rows.results ?? []) {
    if (row.source_hash === hash) continue;
    try {
      await applyTransition(TABLE, row.id, { kind: "source_changed" });
      staleCount += 1;
    } catch {
      // Already stale or terminal — nothing to redo.
    }
  }
  return { stale_count: staleCount };
}
