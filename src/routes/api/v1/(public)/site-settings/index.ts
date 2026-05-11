import { createFileRoute } from "@tanstack/react-router";

import { corsJson, corsOptions } from "@/core/middlewares/cors";
import { getSiteSettings } from "@/features/settings";

interface RemoteAreaLink {
  label: string;
  icon?: string;
  url: string;
}

function parseRemoteAreaLinks(raw: string | null): RemoteAreaLink[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter(
      (x): x is RemoteAreaLink =>
        x && typeof x === "object" && typeof x.label === "string" && typeof x.url === "string",
    );
  } catch {
    return [];
  }
}

function parseTerminology(raw: string | null): unknown[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export const Route = createFileRoute("/api/v1/(public)/site-settings/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request }) => {
        const row = await getSiteSettings();
        if (!row) {
          return corsJson(request, { settings: null });
        }
        return corsJson(request, {
          settings: {
            brand_name: row.brand_name,
            ga4_id: row.ga4_id,
            gtm_id: row.gtm_id,
            fb_pixel_id: row.fb_pixel_id,
            tiktok_pixel_id: row.tiktok_pixel_id,
            contact_phone: row.contact_phone,
            contact_email: row.contact_email,
            facebook_url: row.facebook_url,
            lead_form_destination: row.lead_form_destination,
            logo_media_id: row.logo_media_id,
            default_og_image_id: row.default_og_image_id,
            about_video_url: row.about_video_url,
            remote_area_links: parseRemoteAreaLinks(row.remote_area_links_json),
            terminology: parseTerminology(row.terminology_json),
          },
        });
      },
    },
  },
});
