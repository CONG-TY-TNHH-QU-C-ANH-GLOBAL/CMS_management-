// Pure campaign logic: no D1, no Worker globals, safe in bun:test and in the
// browser bundle. The service and the public routes compose these.

import { z } from "zod";

export interface CampaignMenuItem {
  icon: string;
  title: string;
  subtitle: string | null;
  href: string;
}

/** Vietnam has had no DST since 1975, so a fixed +07:00 offset is exact. */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Today's calendar date in Asia/Ho_Chi_Minh as YYYY-MM-DD. */
export function vnToday(now: Date = new Date()): string {
  return new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** The flag the public API reports: the operator toggle is on, the campaign is
 *  live, and today (VN) is not after end_date. A NULL end_date never expires.
 *  ISO dates compare correctly as strings. */
export function effectiveFlag(
  toggle: number | boolean,
  status: string,
  endDate: string | null,
  today: string,
): boolean {
  if (!toggle || status !== "live") return false;
  return endDate === null || endDate === "" || today <= endDate;
}

const menuItemSchema = z.object({
  icon: z.string().max(16).default(""),
  title: z.string().min(1).max(120),
  subtitle: z.string().max(200).nullable().optional(),
  href: z.string().min(1).max(500),
});

/** Parse menu_items_json. Malformed JSON or a non-array yields []; individual
 *  malformed items are dropped rather than failing the whole menu. */
export function parseMenuItems(json: string | null | undefined): CampaignMenuItem[] {
  if (!json) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: CampaignMenuItem[] = [];
  for (const entry of raw) {
    const parsed = menuItemSchema.safeParse(entry);
    if (!parsed.success) continue;
    const { icon, title, subtitle, href } = parsed.data;
    out.push({ icon, title, subtitle: subtitle?.trim() ? subtitle : null, href });
  }
  return out;
}

/** Overlay a translation's titles/subtitles onto the VI menu by position.
 *  Icon and href always come from VI: they are identifiers, not copy. */
export function mergeMenuItems(
  source: CampaignMenuItem[],
  translated: CampaignMenuItem[] | null,
): CampaignMenuItem[] {
  if (!translated || translated.length === 0) return source;
  return source.map((item, index) => {
    const t = translated[index];
    if (!t) return item;
    return { ...item, title: t.title, subtitle: t.subtitle ?? item.subtitle };
  });
}

/** landing_path / menu href rule: internal path without the language prefix,
 *  or an absolute https URL. */
export function isValidCampaignHref(value: string): boolean {
  if (/^https:\/\/[^\s]+$/i.test(value)) return true;
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  return !/^\/(vi|en|zh)(\/|$|#|\?)/.test(value) && !/\s/.test(value);
}

/** A live campaign as the public reader selects it: VI row with the reviewed
 *  translation's prose already COALESCEd in, plus the translated menu JSON. */
export interface PublicCampaignRow {
  id: number;
  slug: string;
  title: string;
  summary: string | null;
  body_md: string | null;
  cover_media_id: number | null;
  og_image_id: number | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  position: number;
  landing_path: string | null;
  cta_label: string | null;
  nav_featured: number;
  nav_label: string | null;
  nav_badge: string | null;
  home_featured: number;
  menu_items_json: string;
  tr_menu_items_json: string | null;
  seo_title: string | null;
  seo_description: string | null;
  updated_at: number;
}

const blankToNull = (value: string | null): string | null =>
  value === null || value.trim() === "" ? null : value;

/** Row → contract DTO (list fields + detail-only prose). The route picks which
 *  keys to publish; this keeps flag and menu logic in one tested place. */
export function toPublicCampaign(
  row: PublicCampaignRow,
  media: ReadonlyMap<number, string>,
  today: string,
) {
  const mediaUrl = (id: number | null) => (id === null ? null : (media.get(id) ?? null));
  const menu = mergeMenuItems(
    parseMenuItems(row.menu_items_json),
    row.tr_menu_items_json === null ? null : parseMenuItems(row.tr_menu_items_json),
  );
  return {
    list: {
      slug: row.slug,
      title: row.title,
      summary: blankToNull(row.summary),
      cover_url: mediaUrl(row.cover_media_id),
      og_image_url: mediaUrl(row.og_image_id),
      start_date: blankToNull(row.start_date),
      end_date: blankToNull(row.end_date),
      position: row.position,
      landing_path: blankToNull(row.landing_path),
      cta_label: blankToNull(row.cta_label),
      nav_featured: effectiveFlag(row.nav_featured, row.status, row.end_date, today),
      nav_label: blankToNull(row.nav_label),
      nav_badge: blankToNull(row.nav_badge),
      home_featured: effectiveFlag(row.home_featured, row.status, row.end_date, today),
      menu_items: menu,
      updated_at: row.updated_at,
    },
    detail: {
      body_md: blankToNull(row.body_md),
      seo_title: blankToNull(row.seo_title),
      seo_description: blankToNull(row.seo_description),
    },
  };
}
