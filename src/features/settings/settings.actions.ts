import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type { SiteSettingsRow } from "@/features/settings";

export const getSiteSettingsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { getSiteSettings } = await import("@/features/settings");
  await requireSession("viewer");
  return { settings: await getSiteSettings() };
});

const updateSchema = z.object({
  brand_name: z.string().min(1).max(100).optional(),
  logo_media_id: z.number().int().positive().nullable().optional(),
  default_og_image_id: z.number().int().positive().nullable().optional(),
  ga4_id: z.string().max(50).nullable().optional(),
  gtm_id: z.string().max(50).nullable().optional(),
  fb_pixel_id: z.string().max(50).nullable().optional(),
  tiktok_pixel_id: z.string().max(50).nullable().optional(),
  contact_phone: z.string().max(50).nullable().optional(),
  contact_email: z.string().email().max(254).nullable().optional(),
  facebook_url: z.string().url().max(500).nullable().optional(),
  lead_form_destination: z.string().url().max(500).nullable().optional(),
  about_video_url: z.string().url().max(500).nullable().optional(),
});

export const updateSiteSettingsFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => updateSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { updateSiteSettings } = await import("@/features/settings");
    const { env } = await import("cloudflare:workers");
    const me = await requireSession("admin");
    await updateSiteSettings(data, me.id);
    await env.CMS_REV.put("rev", String(Date.now()));
    return { ok: true as const };
  });
