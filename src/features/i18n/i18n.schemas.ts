// Public response schemas for /api/v1 endpoints under the i18n feature.
//
// Same discipline as content.schemas.ts (D2.1): EXTRACTED shapes of current
// runtime payloads. No runtime validation added. No openapi imports here.

import { z } from "zod";

// Locale enum mirrors `Locale` from @/features/i18n/i18n.service.ts:6.
// Local copy (not imported from content.schemas) because i18n is a more
// foundational feature than content — content depends on i18n, not the
// other way around.
const localeSchema = z.enum(["en", "vi", "zh"]);

// /api/v1/translations?lang=<en|vi|zh> response body.
// Built in translations/index.ts:17 as `{ locale: lang, translations }`.
// `translations` is the dictionary returned by getTranslations() in
// i18n.service.ts:19 — typed `Record<string, string>` at the source, where
// every i18n key maps to its localized string. Both keys and values are
// guaranteed strings; no nullability.
export const translationsResponseSchema = z.object({
  locale: localeSchema,
  translations: z.record(z.string(), z.string()),
});

export type TranslationsResponse = z.infer<typeof translationsResponseSchema>;
