// Public response schemas for /api/v1 endpoints under the settings feature.
//
// Same discipline as other *.schemas.ts (Phase D2): extracted shapes of
// current runtime payloads. No openapi imports here, no runtime
// validation added, no normalization.

import { z } from "zod";

// Remote area link — backend handler validates inner shape via type
// guard (parseRemoteAreaLinks at site-settings/index.ts:12-23). Wire
// shape is exactly { label, url, icon? }.
const remoteAreaLinkSchema = z.object({
  label: z.string(),
  icon: z.string().optional(),
  url: z.string(),
});

// Terminology — backend handler does NOT structurally validate inner
// items (parseTerminology at site-settings/index.ts:26-34 just checks
// it's an array). Wire shape per backend is `unknown[]`. Landing's
// existing schema (cmsTerminologyGroupSchema) narrows this to a
// trilingual structure, which is a tighter consumer assumption — D5
// cross-check will surface that mismatch as documented drift.
const terminologyEntrySchema = z.unknown();

// Body of the singleton site-settings document. All fields mirror the
// route handler's projection at site-settings/index.ts:46-61. Most
// scalars are nullable; brand_name is non-null (the only required
// string at the DB level).
const siteSettingsBodySchema = z.object({
  brand_name: z.string(),
  ga4_id: z.string().nullable(),
  gtm_id: z.string().nullable(),
  fb_pixel_id: z.string().nullable(),
  tiktok_pixel_id: z.string().nullable(),
  contact_phone: z.string().nullable(),
  contact_email: z.string().nullable(),
  facebook_url: z.string().nullable(),
  lead_form_destination: z.string().nullable(),
  logo_media_id: z.number().int().nullable(),
  default_og_image_id: z.number().int().nullable(),
  about_video_url: z.string().nullable(),
  og_image_url: z.string().nullable(),
  remote_area_links: z.array(remoteAreaLinkSchema),
  terminology: z.array(terminologyEntrySchema),
});

// /api/v1/site-settings response body.
// Singleton. Returns `{ settings: null }` if the row is missing
// (handler line: site-settings/index.ts:43).
export const siteSettingsResponseSchema = z.object({
  settings: siteSettingsBodySchema.nullable(),
});

export type SiteSettingsResponse = z.infer<typeof siteSettingsResponseSchema>;
