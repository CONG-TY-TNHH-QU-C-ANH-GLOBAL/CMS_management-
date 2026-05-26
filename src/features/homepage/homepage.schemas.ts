// Public response schemas for /api/v1 endpoints under the homepage feature.
//
// Same discipline as other *.schemas.ts (Phase D2): extracted shapes of
// current runtime payloads. No openapi imports here, no runtime
// validation added, no normalization.

import { z } from "zod";

const localeSchema = z.enum(["en", "vi", "zh"]);

// Block kinds mirror the HomepageBlockKind union in homepage.service.ts:12.
// Closed enum — adding a new kind requires updating both the service
// type and this schema in lockstep.
const homepageBlockKindSchema = z.enum([
  "hero",
  "trust",
  "services_grid",
  "about_video",
  "marquee",
  "sellers",
  "process",
  "advantages",
  "integrations",
  "testimonials",
  "faq",
  "contact",
]);

// One homepage block as returned by listHomepageBlocksForLocale.
// Source type: HomepageBlock (homepage.service.ts:39-45).
// `payload` is a flat string-keyed-string-valued map — the admin form
// only edits strings, and the safeParse helper in the service coerces
// any non-string values to "" (see homepage.service.ts:47-60). NEVER
// nullable on the wire — fallback is "{}".
const homepageBlockSchema = z.object({
  id: z.number().int(),
  kind: homepageBlockKindSchema,
  position: z.number().int(),
  payload: z.record(z.string(), z.string()),
  locale: localeSchema,
});

// /api/v1/homepage?lang=<en|vi|zh> response body.
// Built in homepage/index.ts:20 as `{ locale: lang, blocks }`.
export const homepageResponseSchema = z.object({
  locale: localeSchema,
  blocks: z.array(homepageBlockSchema),
});

export type HomepageResponse = z.infer<typeof homepageResponseSchema>;
