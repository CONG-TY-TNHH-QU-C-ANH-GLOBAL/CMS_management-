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
            // `lead_form_destination` is REMOVED from this public response. It is operator
            // configuration — an admin-set URL (settings.actions.ts validates it as
            // z.string().url()) naming where leads are routed — published on an
            // unauthenticated endpoint with NO consumer: neither the Vite app nor the Next app
            // reads it. Publishing the lead destination lets anyone discover and target it
            // directly. The column and the admin editor are untouched; only the public
            // projection drops it. Removal is safe because the field had no reader — see the
            // note on this route in src/openapi/route-classification.ts.
            logo_media_id: row.logo_media_id,
            default_og_image_id: row.default_og_image_id,
            about_video_url: row.about_video_url,
            og_image_url: row.og_image_url,
            remote_area_links: parseRemoteAreaLinks(row.remote_area_links_json),
            terminology: parseTerminology(row.terminology_json),
          },
        });
      },
    },
  },
});
