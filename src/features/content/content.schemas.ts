// Public response schemas for /api/v1 endpoints under the content feature.
//
// These are EXTRACTED descriptions of shapes that current route handlers
// already return — they do NOT add runtime validation to the handlers in
// D2.1. The route handlers continue to call corsJson(request, data) on the
// raw service output, identical to pre-D2 behavior. Consumers:
//
//   1. src/openapi/paths.ts — OpenAPI registration (Phase D2.x).
//   2. THG_landingpage Zod cross-check (Phase D5) via codegen.
//
// Rules (constraint from D2.1 brief):
//   - This file imports ZERO openapi internals. `.openapi()` calls live in
//     src/openapi/paths.ts so they only run after registry.ts has extended
//     the Zod prototype.
//   - No normalization or refactor during extraction. The shapes here match
//     the runtime output exactly — same key names, same nullability, same
//     enum values that the existing route + service code already emits.
//   - One schema per response, exported as a const. Type aliases via
//     z.infer<typeof X> are convenience exports for downstream consumers.

import { z } from "zod";

// Locale enum mirrors `Locale` from @/features/i18n (line: i18n.service.ts:6).
// Inlined as a tuple because z.enum() requires a literal-tuple at the type
// level; SUPPORTED_LOCALES is typed `readonly Locale[]` which loses the
// literal tuple at the call site. Values must stay in lockstep with the
// i18n module — covered by the drift check script in D2.1.
const localeSchema = z.enum(["en", "vi", "zh"]);

// One FAQ row as returned by listFaqsForLocale (content.service.ts:347).
// DB constraints (db/migrations/0001_init.sql:faqs):
//   id INTEGER NOT NULL, position INTEGER NOT NULL,
//   question TEXT NOT NULL, answer TEXT NOT NULL.
// faq_translations join (en/zh) preserves the same NOT NULL guarantees.
const faqItemSchema = z.object({
  id: z.number().int(),
  position: z.number().int(),
  question: z.string(),
  answer: z.string(),
});

// /api/v1/faqs?lang=<en|vi|zh>&scope=<string> response body.
// Built in faqs/index.ts:22 as `{ locale: lang, scope, faqs }`.
// Note: `scope` accepts any string (current server default = "home", no
// further validation). DO NOT tighten — that would change runtime behavior.
export const faqsResponseSchema = z.object({
  locale: localeSchema,
  scope: z.string(),
  faqs: z.array(faqItemSchema),
});

export type FaqsResponse = z.infer<typeof faqsResponseSchema>;

// One testimonial row as projected by the route handler (testimonials/index.ts:17-25).
// Source type: TestimonialRow (content.service.ts:694-702). The `locale` field
// from the row is INTENTIONALLY NOT included in the response item — the response
// wrapper carries `locale` at the top level instead.
// Nullability mirrors DB: quote / author_name are NOT NULL; author_role and
// avatar_media_id are nullable. DO NOT tighten.
const testimonialItemSchema = z.object({
  id: z.number().int(),
  position: z.number().int(),
  quote: z.string(),
  author_name: z.string(),
  author_role: z.string().nullable(),
  avatar_media_id: z.number().int().nullable(),
});

// /api/v1/testimonials?lang=<en|vi|zh> response body.
// Built in testimonials/index.ts:26 as `{ locale: lang, testimonials }`.
export const testimonialsResponseSchema = z.object({
  locale: localeSchema,
  testimonials: z.array(testimonialItemSchema),
});

export type TestimonialsResponse = z.infer<typeof testimonialsResponseSchema>;

// One contact-location row as projected by the route handler
// (contact-locations/index.ts:19-28). Source type: ContactLocationRow
// (content.service.ts:892-902). The handler filters by locale and strips it
// from the item — wrapper carries `locale` instead.
// `kind` is a 5-value enum mirroring DB CHECK constraint. address / phone /
// url / lang_class are nullable; label is NOT NULL.
const contactLocationKindSchema = z.enum([
  "office",
  "warehouse",
  "phone",
  "email",
  "website",
]);

const contactLocationItemSchema = z.object({
  id: z.number().int(),
  position: z.number().int(),
  kind: contactLocationKindSchema,
  label: z.string(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  url: z.string().nullable(),
  lang_class: z.string().nullable(),
});

// /api/v1/contact-locations?lang=<en|vi|zh> response body.
// Built in contact-locations/index.ts:29 as `{ locale: lang, locations: filtered }`.
export const contactLocationsResponseSchema = z.object({
  locale: localeSchema,
  locations: z.array(contactLocationItemSchema),
});

export type ContactLocationsResponse = z.infer<typeof contactLocationsResponseSchema>;

// One integration row as projected by the route handler (integrations/index.ts:14-21).
// Source type: IntegrationRow (content.service.ts:1053-1060). No locale on row.
// name is NOT NULL; url / color_class / logo_media_id are nullable.
const integrationItemSchema = z.object({
  id: z.number().int(),
  position: z.number().int(),
  name: z.string(),
  url: z.string().nullable(),
  color_class: z.string().nullable(),
  logo_media_id: z.number().int().nullable(),
});

// /api/v1/integrations response body.
// Built in integrations/index.ts:22 as `{ integrations: sorted }`.
// Note: NO `locale` field — integrations are not localized.
export const integrationsResponseSchema = z.object({
  integrations: z.array(integrationItemSchema),
});

export type IntegrationsResponse = z.infer<typeof integrationsResponseSchema>;

// ──── HEIGHTENED-WATCH FIELD ────
// `alt_text: z.string()` (non-null). Same regression class as
// blog_slides[].alt_text (incident 11e9230 lineage). Sources:
//   - DB constraint:  marquee_images.alt_text TEXT NOT NULL
//                     (db/migrations/0001_init.sql, line 232)
//   - Service type:   MarqueeImageRow.alt_text: string
//                     (content.service.ts, line 1194)
//   - Landing Zod:    cmsMarqueeImageSchema.alt_text: z.string()
//                     (THG_landingpage/src/lib/cmsSchemas.ts, line 156)
// Do NOT change to .nullable().
const marqueeImageItemSchema = z.object({
  id: z.number().int(),
  position: z.number().int(),
  src: z.string(),
  alt_text: z.string(),
});

// /api/v1/marquee-images response body.
// Built in marquee-images/index.ts:20 as `{ images: sorted }`.
// Note: NO `locale` field — marquee images are not localized.
export const marqueeImagesResponseSchema = z.object({
  images: z.array(marqueeImageItemSchema),
});

export type MarqueeImagesResponse = z.infer<typeof marqueeImagesResponseSchema>;
