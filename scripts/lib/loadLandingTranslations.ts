// Loads the landing repo's composed static translation dictionary by
// importing it directly (Bun resolves the TS module chain — it is React-free
// and Vite-free). Replaces the old textual extraction of i18n.tsx, which
// broke once dictionary entries used the tr(...) helper and again when the
// dictionary moved to src/lib/i18n/translations/ (Sprint 9).

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export type LandingLocale = "en" | "vi" | "zh";
export type LandingTranslations = Record<string, Record<LandingLocale, string>>;

export async function loadLandingTranslations(): Promise<LandingTranslations> {
  const moduleUrl = pathToFileURL(
    resolve(
      process.cwd(),
      "..",
      "THG_landingpage",
      "src",
      "lib",
      "i18n",
      "translations",
      "index.ts",
    ),
  ).href;

  const mod = (await import(moduleUrl)) as { translations: LandingTranslations };
  if (!mod.translations || typeof mod.translations !== "object") {
    throw new Error(`Landing translations export not found at ${moduleUrl}`);
  }
  return mod.translations;
}
