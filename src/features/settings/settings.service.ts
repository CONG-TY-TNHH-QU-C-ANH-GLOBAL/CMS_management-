// Site settings — singleton row (id=1) chứa brand info + tracking IDs + contact.

import { getDb } from "@/core/db/client";

export interface SiteSettingsRow {
  id: number;
  brand_name: string;
  logo_media_id: number | null;
  default_og_image_id: number | null;
  ga4_id: string | null;
  gtm_id: string | null;
  fb_pixel_id: string | null;
  tiktok_pixel_id: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  facebook_url: string | null;
  lead_form_destination: string | null;
  about_video_url: string | null;
  remote_area_links_json: string | null;
  terminology_json: string | null;
  updated_at: number;
}

export async function getSiteSettings(): Promise<SiteSettingsRow | null> {
  return await getDb()
    .prepare(`SELECT * FROM site_settings WHERE id = 1 LIMIT 1`)
    .first<SiteSettingsRow>();
}

export interface UpdateSiteSettingsInput {
  brand_name?: string;
  logo_media_id?: number | null;
  default_og_image_id?: number | null;
  ga4_id?: string | null;
  gtm_id?: string | null;
  fb_pixel_id?: string | null;
  tiktok_pixel_id?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  facebook_url?: string | null;
  lead_form_destination?: string | null;
  about_video_url?: string | null;
  remote_area_links_json?: string | null;
  terminology_json?: string | null;
}

export async function updateSiteSettings(
  input: UpdateSiteSettingsInput,
  actorId: number,
): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    values.push(value);
  }
  if (fields.length === 0) return;
  fields.push("updated_at = unixepoch()", "updated_by = ?");
  values.push(actorId);
  await getDb()
    .prepare(`UPDATE site_settings SET ${fields.join(", ")} WHERE id = 1`)
    .bind(...values)
    .run();
}
