// Public-API view of a campaign's landing address. Kept out of landing.config.ts (pure) because it
// reads the Worker env.
import { env } from "cloudflare:workers";

import { landingOriginOf, landingPathOnMainSite, mainSiteOriginOf } from "./landing.config";

/** `landing_path` as the website should link to it: under the main domain while the flag is on. */
export function publicLandingPath(path: string | null): string | null {
  return landingPathOnMainSite(path, landingOriginOf(env), mainSiteOriginOf(env));
}
