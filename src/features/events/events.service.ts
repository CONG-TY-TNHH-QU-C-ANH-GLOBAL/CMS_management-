import { getDb } from "@/core/db/client";

export type EventLocale = "en" | "vi" | "zh";
export interface EventRow {
  id: number;
  slug: string;
  locale: EventLocale;
  title: string;
  summary: string | null;
  body_md: string | null;
  cover_media_id: number | null;
  event_date: string;
  end_date: string | null;
  location: string | null;
  role: string | null;
  url: string | null;
  video_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
}
const COLUMNS =
  "id, slug, locale, title, summary, body_md, cover_media_id, event_date, end_date, location, role, url, video_url, seo_title, seo_description";
export async function listLiveEvents(locale: EventLocale): Promise<EventRow[]> {
  const result = await getDb()
    .prepare(
      `SELECT ${COLUMNS} FROM events WHERE locale = ? AND status = 'live' ORDER BY event_date DESC, id DESC`,
    )
    .bind(locale)
    .all<EventRow>();
  return result.results ?? [];
}
export async function getLiveEvent(slug: string, locale: EventLocale): Promise<EventRow | null> {
  return getDb()
    .prepare(
      `SELECT ${COLUMNS} FROM events WHERE slug = ? AND locale = ? AND status = 'live' LIMIT 1`,
    )
    .bind(slug, locale)
    .first<EventRow>();
}
