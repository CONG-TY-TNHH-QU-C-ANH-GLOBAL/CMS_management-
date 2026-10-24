// Cookie names, attributes and parsing for the admin session and the OAuth
// round-trip. Pure (no D1, no Worker env) so it is unit-testable.
//
// WHY `__Host-` IN PRODUCTION. lp.thgfulfill.com serves uploaded landing pages
// that run arbitrary scripts, and it is a sibling of cms.thgfulfill.com. A
// script there can write `thg_sid=<attacker session>; Domain=thgfulfill.com;
// Path=/admin` and the browser would send it to the CMS ahead of the real
// cookie (cookie tossing / session fixation), and the same for the OAuth state
// (login CSRF). A `__Host-` cookie is only accepted by the browser when it is
// Secure, Path=/ and has NO Domain attribute — so no other subdomain can ever
// set or shadow it. In production the CMS reads ONLY the prefixed names; an
// unprefixed `thg_sid` is ignored (clean cutover: users log in once again).
// Local dev runs on plain http, where Secure cookies are not usable, so it
// keeps the unprefixed names.

export const SESSION_COOKIE = "thg_sid";
export const OAUTH_STATE_COOKIE = "thg_oauth_state";
export const OAUTH_REDIRECT_COOKIE = "thg_oauth_redirect";
export const HOST_PREFIX = "__Host-";

/** The name a cookie actually uses: `__Host-<name>` in production, `<name>` in dev. */
export function cookieName(base: string, isProduction: boolean): string {
  return isProduction ? `${HOST_PREFIX}${base}` : base;
}

/** Set-Cookie value with the attributes every CMS cookie shares. Never a Domain attribute. */
export function buildCookie(
  base: string,
  value: string,
  maxAgeSeconds: number,
  isProduction: boolean,
): string {
  const parts = [
    `${cookieName(base, isProduction)}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  ];
  if (isProduction) parts.push("Secure");
  return parts.join("; ");
}

/** Value of the first cookie named exactly `cookieName(base, isProduction)`, else "". */
export function readCookie(
  cookieHeader: string | null,
  base: string,
  isProduction: boolean,
): string {
  if (!cookieHeader) return "";
  const name = cookieName(base, isProduction);
  for (const part of cookieHeader.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq) === name) return part.slice(eq + 1);
  }
  return "";
}
