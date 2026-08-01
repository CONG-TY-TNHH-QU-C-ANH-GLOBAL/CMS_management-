// The private object namespace: R2 keys the public media proxy must never serve.
//
// WHY THIS EXISTS
//
// Applicant CVs are stored in the same R2 bucket as marketing images, and the public
// `/api/v1/media/{key}` proxy served ANY key it was given — with
// `Cache-Control: public, max-age=86400, s-maxage=604800, immutable`. So a CV was not merely
// reachable by URL: once fetched, it sat in shared caches for a week.
//
// The upload handler's own comment described the random key as
// "security-through-obscurity — only HR + applicant who submitted have the URL". That is not
// authorization. Randomness resists ENUMERATION; it does nothing once the URL exists, and
// this URL was stored in D1, sent to a Telegram channel, and rendered as a plain link in the
// admin UI. Browser history, logs, referrers, forwarded messages and screenshots all leak it,
// and the object was permanently readable by anyone holding it, forever, with no revocation.
//
// The key stays random — it is a good collision-resistant private identifier. It is simply no
// longer the access-control mechanism.
//
// This module is the single source of truth for the boundary. Both the proxy that DENIES and
// the uploader that WRITES import from here, so the two cannot drift into disagreement about
// what "private" means.

/** Key prefixes the public media proxy refuses to serve. */
export const PRIVATE_OBJECT_PREFIXES = ["applicants/"] as const;

/**
 * True when this R2 key holds private data and must not be served publicly.
 *
 * Compared on the DECODED key, after any percent-decoding the caller performs, so
 * `applicants%2Fx.pdf` cannot slip past. Callers must normalize before asking.
 */
export function isPrivateObjectKey(key: string): boolean {
  return PRIVATE_OBJECT_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/** Where applicant CVs live. Under a private prefix by construction. */
export const APPLICANT_CV_PREFIX = "applicants/";
