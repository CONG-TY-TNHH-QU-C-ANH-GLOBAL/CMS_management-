// i18n service — load translations from D1 for SSR rendering.

import { getDb } from "@/core/db/client";

export type Locale = "en" | "vi" | "zh";

export const SUPPORTED_LOCALES: readonly Locale[] = ["en", "vi", "zh"] as const;
export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Load all translation keys for a given locale.
 * Returns plain key → value map. Used by SSR loader at the (public)/$lang root.
 */
export async function getTranslations(locale: Locale): Promise<Record<string, string>> {
  const result = await getDb()
    .prepare(`SELECT key, value FROM translations WHERE locale = ?`)
    .bind(locale)
    .all<{ key: string; value: string }>();
  const map: Record<string, string> = {};
  for (const row of result.results ?? []) map[row.key] = row.value;
  return map;
}

/**
 * Detect best locale from Accept-Language header.
 * Falls back to DEFAULT_LOCALE if no match.
 */
export function detectLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const parts = acceptLanguage.split(",");
  for (const raw of parts) {
    const code = raw.trim().split(";")[0].trim().toLowerCase();
    const primary = code.split("-")[0];
    if (isLocale(primary)) return primary;
    // zh-CN, zh-TW etc → zh
    if (primary === "zh") return "zh";
    if (primary === "vi") return "vi";
    if (primary === "en") return "en";
  }
  return DEFAULT_LOCALE;
}
