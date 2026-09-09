import { getDb } from "@/core/db/client";

export interface SeoPageRow {
  route: string;
  locale: "vi" | "en" | "zh";
  title: string;
  meta_description: string | null;
  og_image_url: string | null;
  indexable: number;
  status: "draft" | "live" | "archived";
  translation_status: "draft" | "reviewed" | "stale";
  updated_at: number;
}

export async function listSeoPages(): Promise<SeoPageRow[]> {
  const result = await getDb()
    .prepare(`SELECT route, locale, title, meta_description, og_image_url, indexable, status, translation_status, updated_at FROM pages ORDER BY route, locale`)
    .all<SeoPageRow>();
  return result.results ?? [];
}

export async function saveSeoPage(input: Omit<SeoPageRow, "updated_at">, actorId: number): Promise<void> {
  await getDb()
    .prepare(
      `INSERT INTO pages(route, locale, title, meta_description, og_image_url, indexable, status, translation_status, published_at, updated_at, updated_by)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'live' THEN unixepoch() ELSE NULL END, unixepoch(), ?)
       ON CONFLICT(route, locale) DO UPDATE SET
         title = excluded.title,
         meta_description = excluded.meta_description,
         og_image_url = excluded.og_image_url,
         indexable = excluded.indexable,
         status = excluded.status,
         translation_status = excluded.translation_status,
         published_at = CASE WHEN excluded.status = 'live' THEN COALESCE(pages.published_at, unixepoch()) ELSE pages.published_at END,
         updated_at = unixepoch(),
         updated_by = excluded.updated_by`,
    )
    .bind(input.route, input.locale, input.title, input.meta_description, input.og_image_url, input.indexable, input.status, input.translation_status, input.status, actorId)
    .run();
}
