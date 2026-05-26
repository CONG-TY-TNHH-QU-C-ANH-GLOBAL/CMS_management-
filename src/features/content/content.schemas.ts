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
