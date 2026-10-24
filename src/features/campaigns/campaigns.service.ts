// Campaigns service — "Chương trình" (seasonal / discount programs).
//
// One VI source row per slug (migration 0062); EN/ZH come from
// campaign_translations at status='reviewed', falling back to VI. The public
// reader is a single LEFT JOIN with COALESCE rather than the UNION events need,
// because there are no hand-written per-locale rows to merge.

import { getDb } from "@/core/db/client";
import { auditLog } from "@/core/db/mutations";
import { toMediaUrl } from "@/features/partners/partners.media";

import {
  CAMPAIGN_TRANSLATABLE,
  onCampaignSourceChanged,
} from "../translations/campaign.translation.service";

import type { PublicCampaignRow } from "./campaigns.pure";

export type CampaignLocale = "en" | "vi" | "zh";
export const CAMPAIGN_LOCALES: readonly CampaignLocale[] = ["vi", "en", "zh"];
export type CampaignStatus = "draft" | "live" | "archived";

export interface CampaignRow {
  id: number;
  slug: string;
  title: string;
  summary: string | null;
  body_md: string | null;
  cover_media_id: number | null;
  og_image_id: number | null;
  start_date: string | null;
  end_date: string | null;
  status: CampaignStatus;
  position: number;
  landing_path: string | null;
  cta_label: string | null;
  nav_featured: number;
  nav_label: string | null;
  nav_badge: string | null;
  home_featured: number;
  menu_items_json: string;
  seo_title: string | null;
  seo_description: string | null;
  updated_at: number;
}

/** Columns an editor save may set — the single list the INSERT and UPDATE
 *  builders iterate, so a new editor field cannot skip persistence. */
export const CAMPAIGN_WRITABLE = [
  "title",
  "summary",
  "body_md",
  "cover_media_id",
  "og_image_id",
  "start_date",
  "end_date",
  "status",
  "position",
  "landing_path",
  "cta_label",
  "nav_featured",
  "nav_label",
  "nav_badge",
  "home_featured",
  "menu_items_json",
  "seo_title",
  "seo_description",
] as const;

export type CampaignWritableField = (typeof CAMPAIGN_WRITABLE)[number];

/** Prose the translation pipeline owns (en/zh in campaign_translations). */
export const CAMPAIGN_TRANSLATED_FIELDS = CAMPAIGN_TRANSLATABLE;

const ADMIN_COLUMNS = `id, slug, ${CAMPAIGN_WRITABLE.join(", ")}, updated_at`;

const TRANSLATED_PROSE = CAMPAIGN_TRANSLATED_FIELDS.filter((f) => f !== "menu_items_json");

/** VI row with reviewed prose COALESCEd in. Binding 'vi' matches no
 *  translation (that table only holds en/zh), so VI reads use the same SQL. */
const PUBLIC_SELECT = `SELECT c.id, c.slug, c.cover_media_id, c.og_image_id, c.start_date,
    c.end_date, c.status, c.position, c.landing_path, c.nav_featured, c.nav_badge,
    c.home_featured, c.menu_items_json, c.updated_at,
    t.menu_items_json AS tr_menu_items_json,
    ${TRANSLATED_PROSE.map((f) => `COALESCE(t.${f}, c.${f}) AS ${f}`).join(", ")}
  FROM campaigns c
  LEFT JOIN campaign_translations t
    ON t.campaign_id = c.id AND t.locale = ? AND t.status = 'reviewed'
  WHERE c.locale = 'vi' AND c.status = 'live'`;

// ── Public reads ────────────────────────────────────────────────────────────

export async function listLiveCampaignsForPublic(
  locale: CampaignLocale,
): Promise<PublicCampaignRow[]> {
  const result = await getDb()
    .prepare(`${PUBLIC_SELECT} ORDER BY c.position, c.start_date DESC, c.id DESC`)
    .bind(locale)
    .all<PublicCampaignRow>();
  return result.results ?? [];
}

export async function getLiveCampaignForPublic(
  slug: string,
  locale: CampaignLocale,
): Promise<PublicCampaignRow | null> {
  return getDb()
    .prepare(`${PUBLIC_SELECT} AND c.slug = ? LIMIT 1`)
    .bind(locale, slug)
    .first<PublicCampaignRow>();
}

/** VI always (the source row is live), plus every reviewed translation. */
export async function availableCampaignLocales(campaignId: number): Promise<CampaignLocale[]> {
  const result = await getDb()
    .prepare(
      `SELECT locale FROM campaign_translations WHERE campaign_id = ? AND status = 'reviewed'`,
    )
    .bind(campaignId)
    .all<{ locale: CampaignLocale }>();
  const locales = new Set<CampaignLocale>(["vi", ...(result.results ?? []).map((r) => r.locale)]);
  return CAMPAIGN_LOCALES.filter((locale) => locales.has(locale));
}

/** Cover + OG ids of every row resolved to public URLs in one query, so a
 *  list of campaigns costs one media round trip, not one per row. */
export async function resolveCampaignMedia(
  rows: Pick<PublicCampaignRow, "cover_media_id" | "og_image_id">[],
  origin: string,
): Promise<Map<number, string>> {
  const ids = [...new Set(rows.flatMap((row) => [row.cover_media_id, row.og_image_id]))].filter(
    (id): id is number => id !== null,
  );
  const out = new Map<number, string>();
  if (ids.length === 0) return out;
  const result = await getDb()
    .prepare(`SELECT id, r2_key FROM media WHERE id IN (${ids.map(() => "?").join(",")})`)
    .bind(...ids)
    .all<{ id: number; r2_key: string }>();
  for (const row of result.results ?? []) {
    const url = toMediaUrl(row.r2_key, origin);
    if (url) out.set(row.id, url);
  }
  return out;
}

// ── Admin reads ─────────────────────────────────────────────────────────────

export async function listCampaigns(): Promise<CampaignRow[]> {
  const result = await getDb()
    .prepare(`SELECT ${ADMIN_COLUMNS} FROM campaigns ORDER BY position, start_date DESC, id DESC`)
    .all<CampaignRow>();
  return result.results ?? [];
}

export async function getCampaign(slug: string): Promise<CampaignRow | null> {
  return getDb()
    .prepare(`SELECT ${ADMIN_COLUMNS} FROM campaigns WHERE slug = ? AND locale = 'vi' LIMIT 1`)
    .bind(slug)
    .first<CampaignRow>();
}

async function getCampaignById(id: number): Promise<CampaignRow | null> {
  return getDb()
    .prepare(`SELECT ${ADMIN_COLUMNS} FROM campaigns WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<CampaignRow>();
}

// ── Writes ──────────────────────────────────────────────────────────────────

export type CampaignInput = { slug: string; title: string } & Partial<
  Record<Exclude<CampaignWritableField, "title">, unknown>
>;
export type UpdateCampaignInput = { id: number } & Partial<Record<CampaignWritableField, unknown>>;

function notFound(): Error {
  return Object.assign(new Error("Không tìm thấy Chương trình."), { statusCode: 404 });
}

/** Translation bookkeeping after a VI save. A pipeline failure must never fail
 *  the edit the operator just made, so everything here is best-effort. */
async function afterSourceSaved(actorId: number, row: CampaignRow, sourceChanged: boolean) {
  try {
    const jobs = await import("../translations/translation-jobs.service");
    if (sourceChanged) await onCampaignSourceChanged(row.id, row);
    await jobs.enqueueMissingTranslationLocales(actorId, "campaign", row.id);
  } catch (error) {
    console.error("[campaigns] translation hook failed", error);
  }
}

export async function createCampaign(actorId: number, input: CampaignInput): Promise<CampaignRow> {
  if (await getCampaign(input.slug)) {
    throw Object.assign(new Error(`Đã có Chương trình "${input.slug}".`), { statusCode: 409 });
  }
  const columns = CAMPAIGN_WRITABLE.filter((key) => input[key] !== undefined);
  const inserted = await getDb()
    .prepare(
      `INSERT INTO campaigns (slug, locale, ${columns.join(", ")}, updated_at, updated_by)
       VALUES (?, 'vi', ${columns.map(() => "?").join(", ")}, unixepoch(), ?)
       RETURNING ${ADMIN_COLUMNS}`,
    )
    .bind(input.slug, ...columns.map((key) => input[key]), actorId)
    .first<CampaignRow>();
  if (!inserted) throw new Error("Không tạo được Chương trình.");
  await auditLog(actorId, "create", "campaigns", inserted.id, null, inserted);
  await afterSourceSaved(actorId, inserted, false);
  return inserted;
}

export async function updateCampaign(
  actorId: number,
  input: UpdateCampaignInput,
): Promise<CampaignRow> {
  const before = await getCampaignById(input.id);
  if (!before) throw notFound();
  const columns = CAMPAIGN_WRITABLE.filter((key) => input[key] !== undefined);
  if (columns.length === 0) return before;

  const after = await getDb()
    .prepare(
      `UPDATE campaigns SET ${columns.map((key) => `${key} = ?`).join(", ")},
         updated_at = unixepoch(), updated_by = ?
       WHERE id = ? RETURNING ${ADMIN_COLUMNS}`,
    )
    .bind(...columns.map((key) => input[key]), actorId, input.id)
    .first<CampaignRow>();
  if (!after) throw notFound();
  await auditLog(actorId, "update", "campaigns", input.id, before, after);
  const sourceChanged = CAMPAIGN_TRANSLATED_FIELDS.some((key) => before[key] !== after[key]);
  await afterSourceSaved(actorId, after, sourceChanged);
  return after;
}

/** D1 does not enforce ON DELETE CASCADE (repo convention, 0035 header), so
 *  translations and uploaded landing versions are removed explicitly. The
 *  landing files stay in R2 under landings/<slug>/ (immutable, unreferenced). */
export async function deleteCampaign(actorId: number, id: number): Promise<void> {
  const before = await getCampaignById(id);
  if (!before) return;
  const db = getDb();
  await db.batch([
    db.prepare(`DELETE FROM campaign_translations WHERE campaign_id = ?`).bind(id),
    db.prepare(`DELETE FROM campaign_landing_versions WHERE campaign_id = ?`).bind(id),
    db.prepare(`DELETE FROM campaigns WHERE id = ?`).bind(id),
  ]);
  await auditLog(actorId, "delete", "campaigns", id, before, null);
}
