// i18n service — load translations from D1 for SSR rendering.

import { auditLog } from "@/core/db/mutations";
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

export interface TranslationRow {
  key: string;
  locale: Locale;
  value: string;
  updated_at: number;
  updated_by: number | null;
}

/** Admin read — every (key, locale) row across all locales. Used by the
 *  translations admin grid so all 3 locales render side-by-side. */
export async function listAllTranslations(): Promise<TranslationRow[]> {
  const result = await getDb()
    .prepare(
      `SELECT key, locale, value, updated_at, updated_by FROM translations
        ORDER BY key, locale`,
    )
    .all<TranslationRow>();
  return result.results ?? [];
}

/** Upsert a single (key, locale) → value. Composite PK (key, locale) means
 *  the same call creates a new row when missing or updates an existing one.
 *  Caller decides how to scope keys (no naming policy enforced here). */
export async function upsertTranslation(
  actorId: number,
  input: { key: string; locale: Locale; value: string },
): Promise<TranslationRow> {
  const before = await getDb()
    .prepare(`SELECT key, locale, value, updated_at, updated_by FROM translations WHERE key = ? AND locale = ? LIMIT 1`)
    .bind(input.key, input.locale)
    .first<TranslationRow>();

  const now = Math.floor(Date.now() / 1000);
  await getDb()
    .prepare(
      `INSERT INTO translations (key, locale, value, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (key, locale) DO UPDATE
           SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    )
    .bind(input.key, input.locale, input.value, now, actorId)
    .run();

  const after: TranslationRow = {
    key: input.key,
    locale: input.locale,
    value: input.value,
    updated_at: now,
    updated_by: actorId,
  };
  await auditLog(
    actorId,
    before ? "update" : "create",
    "translations",
    `${input.key}:${input.locale}`,
    before,
    after,
  );
  return after;
}

/** Hard-delete a single (key, locale) row. The matching key in landing's
 *  static i18n.tsx fallback dictionary (if any) takes over on next fetch. */
export async function deleteTranslation(
  actorId: number,
  input: { key: string; locale: Locale },
): Promise<void> {
  const before = await getDb()
    .prepare(`SELECT key, locale, value, updated_at, updated_by FROM translations WHERE key = ? AND locale = ? LIMIT 1`)
    .bind(input.key, input.locale)
    .first<TranslationRow>();
  if (!before) return;
  await getDb()
    .prepare(`DELETE FROM translations WHERE key = ? AND locale = ?`)
    .bind(input.key, input.locale)
    .run();
  await auditLog(
    actorId,
    "delete",
    "translations",
    `${input.key}:${input.locale}`,
    before,
    null,
  );
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
