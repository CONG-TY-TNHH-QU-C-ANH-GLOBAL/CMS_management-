// Pure campaign logic: no D1, no Worker globals, safe in bun:test and in the
// browser bundle. The service and the public routes compose these.

import { z } from "zod";

/** Optional promo card shown on the right of the mega-menu while this item is
 *  hovered. Every field falls back to the campaign's own cover/title/summary/CTA
 *  on the website, so a card may set only the parts that differ. */
export interface MenuItemCard {
  image_media_id: number | null;
  title: string | null;
  text: string | null;
  cta_label: string | null;
}

export interface CampaignMenuItem {
  icon: string;
  title: string;
  subtitle: string | null;
  href: string;
  /** Omitted when the item has no card (the stored JSON of older campaigns). */
  card?: MenuItemCard;
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

const cardSchema = z.object({
  image_media_id: z.number().int().positive().nullable().optional(),
  title: z.string().max(120).nullable().optional(),
  text: z.string().max(300).nullable().optional(),
  cta_label: z.string().max(80).nullable().optional(),
});

const menuItemSchema = z.object({
  icon: z.string().max(16).default(""),
  title: z.string().min(1).max(120),
  subtitle: z.string().max(200).nullable().optional(),
  href: z.string().min(1).max(500),
  card: cardSchema.nullable().optional(),
});

const clean = (value: string | null | undefined): string | null => (value?.trim() ? value : null);

/** Normalised card, or undefined when it carries nothing worth showing. */
function normaliseCard(
  raw: z.infer<typeof cardSchema> | null | undefined,
): MenuItemCard | undefined {
  if (!raw) return undefined;
  const card: MenuItemCard = {
    image_media_id: raw.image_media_id ?? null,
    title: clean(raw.title),
    text: clean(raw.text),
    cta_label: clean(raw.cta_label),
  };
  const empty = card.image_media_id === null && !card.title && !card.text && !card.cta_label;
  return empty ? undefined : card;
}

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
    const card = normaliseCard(parsed.data.card);
    out.push({
      icon,
      title,
      subtitle: subtitle?.trim() ? subtitle : null,
      href,
      ...(card ? { card } : {}),
    });
  }
  return out;
}

/** Overlay a translation's titles/subtitles (and card copy) onto the VI menu by
 *  position. Icon, href and the card image always come from VI: they are
 *  identifiers, not copy. */
export function mergeMenuItems(
  source: CampaignMenuItem[],
  translated: CampaignMenuItem[] | null,
): CampaignMenuItem[] {
  if (!translated || translated.length === 0) return source;
  return source.map((item, index) => {
    const t = translated[index];
    if (!t) return item;
    const card = item.card
      ? {
          ...item.card,
          title: t.card?.title ?? item.card.title,
          text: t.card?.text ?? item.card.text,
          cta_label: t.card?.cta_label ?? item.card.cta_label,
        }
      : undefined;
    return {
      ...item,
      title: t.title,
      subtitle: t.subtitle ?? item.subtitle,
      ...(card ? { card } : {}),
    };
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
/** Public shape of a menu item: the card's image id becomes a URL, and `card`
 *  is left out entirely when the item has none. */
function toPublicMenuItem(item: CampaignMenuItem, mediaUrl: (id: number | null) => string | null) {
  const { card, ...rest } = item;
  if (!card) return rest;
  return {
    ...rest,
    card: {
      image_url: mediaUrl(card.image_media_id),
      title: card.title,
      text: card.text,
      cta_label: card.cta_label,
    },
  };
}

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
      menu_items: menu.map((item) => toPublicMenuItem(item, mediaUrl)),
      updated_at: row.updated_at,
    },
    detail: {
      body_md: blankToNull(row.body_md),
      seo_title: blankToNull(row.seo_title),
      seo_description: blankToNull(row.seo_description),
    },
  };
}
