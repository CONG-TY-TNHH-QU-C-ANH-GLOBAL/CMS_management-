// Public response schemas for the /api/v1/events endpoints.
//
// Same discipline as every other *.schemas.ts: the shape is extracted from the
// handler that ships, and src/openapi/contract-bindings.ts asserts the route
// config registers THIS object rather than a lookalike.

import { z } from "zod";

const localeSchema = z.enum(["en", "vi", "zh"]);

/** Fields present on both the list and the detail response. */
const eventBase = {
  id: z.number().int(),
  slug: z.string(),
  locale: localeSchema,
  title: z.string(),
  summary: z.string().nullable(),
  body_md: z.string().nullable(),
  /** Fully-resolved media URL, or null. The landing has no way to turn a media
   *  id into a URL, which is why this is resolved server-side. */
  cover_url: z.string().nullable(),
  /** Social share image, resolved the same way. Null means "fall back to the
   *  cover", which is what the landing does. */
  og_image_url: z.string().nullable(),
  event_date: z.string(),
  end_date: z.string().nullable(),
  location: z.string().nullable(),
  role: z.string().nullable(),
  url: z.string().nullable(),
  video_url: z.string().nullable(),
  seo_title: z.string().nullable(),
  seo_description: z.string().nullable(),
};

export const eventSchema = z.object(eventBase);

/** One gallery photo. `src` is always a usable URL — the handler drops photos
 *  whose media row no longer resolves rather than publishing a null src. */
const eventPhotoSchema = z.object({
  src: z.string(),
  caption: z.string().nullable(),
});

export const eventDetailSchema = z.object({
  ...eventBase,
  photos: z.array(eventPhotoSchema),
});

export const eventsResponseSchema = z.object({
  locale: localeSchema,
  events: z.array(eventSchema),
});

export const eventResponseSchema = z.object({
  locale: localeSchema,
  /** Locales this slug can actually be read in, so the landing can offer a
   *  language switch that only lists languages with real content. */
  available_locales: z.array(localeSchema),
  event: eventDetailSchema,
});
