// Landing host configuration from Worker env, shared by the CMS-side wiring
// (landing.server.ts) and the lp-host wiring (landing.host.server.ts).

export interface LandingEnv {
  LANDING_HOST?: string;
  LANDING_ORIGIN?: string;
  /** "true" = landings are public under the main domain (/{lang}/campaigns/<slug>/). */
  LANDING_ON_MAIN_DOMAIN?: string;
  SITE_ORIGIN?: string;
  BASE_URL: string;
  TURNSTILE_SITE_KEY?: string;
}

export const DEFAULT_LANDING_HOST = "lp.thgfulfill.com";

export function landingHostOf(env: Pick<LandingEnv, "LANDING_HOST">): string {
  return (env.LANDING_HOST ?? "").trim() || DEFAULT_LANDING_HOST;
}

/** Public origin of the landing host, without a trailing slash. */
export function landingOriginOf(env: Pick<LandingEnv, "LANDING_HOST" | "LANDING_ORIGIN">): string {
  const explicit = (env.LANDING_ORIGIN ?? "").trim().replace(/\/+$/, "");
  return explicit || `https://${landingHostOf(env)}`;
}

export const DEFAULT_SITE_ORIGIN = "https://thgroupfulfill.com";

/** Main-site origin when published landings are served under it (flag on), otherwise null. The
 *  nginx proxy on the main domain must be live before the flag is switched on. */
export function mainSiteOriginOf(
  env: Pick<LandingEnv, "LANDING_ON_MAIN_DOMAIN" | "SITE_ORIGIN">,
): string | null {
  if ((env.LANDING_ON_MAIN_DOMAIN ?? "").trim().toLowerCase() !== "true") return null;
  return ((env.SITE_ORIGIN ?? "").trim() || DEFAULT_SITE_ORIGIN).replace(/\/+$/, "");
}

/** `https://thgroupfulfill.com/vi/campaigns/<slug>/<rest>`: the public address of a landing page. */
export function mainSiteLandingUrl(siteOrigin: string, slug: string, rest = ""): string {
  return `${siteOrigin}/vi/campaigns/${slug}/${rest}`;
}

/** Maps a stored landing URL on the landing host to its address on the main domain; any other
 *  value (app-internal path, external URL, preview) is returned untouched. */
export function landingPathOnMainSite(
  path: string | null,
  landingOrigin: string,
  siteOrigin: string | null,
): string | null {
  if (!path || !siteOrigin || !path.startsWith(`${landingOrigin}/`)) return path;
  const rest = path.slice(landingOrigin.length + 1);
  const [slug] = rest.split("/");
  if (!slug || slug.startsWith("_")) return path;
  return mainSiteLandingUrl(siteOrigin, slug, rest.slice(slug.length + 1));
}

/** The config line the Worker prepends to thg-lead.js. */
export function leadScriptConfig(env: LandingEnv): string {
  const config = {
    endpoint: `${env.BASE_URL.replace(/\/+$/, "")}/api/v1/leads`,
    turnstileSiteKey: (env.TURNSTILE_SITE_KEY ?? "").trim(),
  };
  return `window.__THG_LEAD__ = ${JSON.stringify(config)};\n`;
}
