// Applicant-CV link derivation. Pure — no I/O, no framework, importable from the admin UI.
//
// Two jobs, and they exist because a stored `cv_url` outlives the URL scheme that produced it:
//
//   1. Build the authenticated retrieval path for a freshly uploaded object.
//   2. Turn ANY stored `cv_url` — including the legacy public
//      `/api/v1/media/applicants/<key>` form written before the privacy boundary existed —
//      into that same authenticated path.
//
// BACKWARD COMPATIBILITY, stated plainly. Legacy rows keep their old value in D1; nothing is
// rewritten. What changes is that the old URL no longer RESOLVES: the public media proxy now
// refuses the `applicants/` prefix. `hrCvPathFrom` recovers the object key from the legacy URL
// so the admin UI links to the authenticated route instead, which means HR keeps access to
// every historical CV while the public bearer URL stops working for everyone — including
// anyone who already has one. That is the intended outcome, not a regression.

import { APPLICANT_CV_PREFIX } from "@/features/media/media.private";

/** Route serving authenticated CV reads. */
const HR_CV_ROUTE = "/api/v1/applicant-cv/";

/** Legacy public form, kept only so historical values can be recognized and rewritten. */
const LEGACY_MEDIA_ROUTE = "/api/v1/media/";

/** Percent-encode an object key for a URL path while keeping `/` readable as a separator. */
function encodeKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

/** Authenticated retrieval path for a stored CV object key. */
export function applicantCvUrlPath(key: string): string {
  return `${HR_CV_ROUTE}${encodeKey(key)}`;
}

/** The object key inside a stored cv_url, or null when it is not an applicant CV link. */
export function applicantCvKeyFrom(cvUrl: string): string | null {
  for (const route of [HR_CV_ROUTE, LEGACY_MEDIA_ROUTE]) {
    const at = cvUrl.indexOf(route);
    if (at === -1) continue;
    let key: string;
    try {
      key = decodeURIComponent(cvUrl.slice(at + route.length));
    } catch {
      // A malformed percent-sequence is not a key we can act on.
      return null;
    }
    // Only the applicant namespace. A legacy `/api/v1/media/<marketing-image>` is not a CV and
    // must not be turned into an authenticated CV link.
    if (key.startsWith(APPLICANT_CV_PREFIX) && !key.includes("..")) return key;
  }
  return null;
}

/**
 * Authenticated href for a stored `cv_url`, or null when the value is not a recognizable
 * applicant CV.
 *
 * Returning null rather than the original URL is deliberate: the old link no longer resolves,
 * so rendering it would show HR a button that 404s. A caller that gets null should say the CV
 * is unavailable instead.
 */
export function hrCvPathFrom(cvUrl: string | null | undefined): string | null {
  if (!cvUrl) return null;
  const key = applicantCvKeyFrom(cvUrl);
  return key === null ? null : applicantCvUrlPath(key);
}
