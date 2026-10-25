// Landing host configuration from Worker env, shared by the CMS-side wiring
// (landing.server.ts) and the lp-host wiring (landing.host.server.ts).

export interface LandingEnv {
  LANDING_HOST?: string;
  LANDING_ORIGIN?: string;
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

/** The config line the Worker prepends to thg-lead.js. */
export function leadScriptConfig(env: LandingEnv): string {
  const config = {
    endpoint: `${env.BASE_URL.replace(/\/+$/, "")}/api/v1/leads`,
    turnstileSiteKey: (env.TURNSTILE_SITE_KEY ?? "").trim(),
  };
  return `window.__THG_LEAD__ = ${JSON.stringify(config)};\n`;
}
