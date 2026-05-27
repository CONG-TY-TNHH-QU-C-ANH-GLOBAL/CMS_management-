// CSRF defense for state-changing endpoints (TanStack Start server functions
// with method POST/PUT/DELETE, and admin REST mutations).
//
// MECHANISM — Origin header validation
// ────────────────────────────────────
// Every modern browser auto-sets the `Origin` header on cross-site fetch
// and POST requests; the value cannot be forged from JavaScript (it's
// browser-controlled). Comparing `Origin` to our deployed BASE_URL gives
// strong CSRF protection without any client-side wiring.
//
// We use Origin (not the older Referer-only approach) for two reasons:
//   1. Origin is sent on POST/fetch even when Referer is suppressed by
//      strict-referrer policies in the browser.
//   2. Origin only contains scheme + host + port — no path leakage —
//      which makes it safe for the server to log on rejection.
//
// We fall back to Referer only when Origin is missing (some older browsers
// or privacy extensions strip it). Same-host comparison is used either way.
//
// DESIGN NOTE — why not double-submit token?
// ──────────────────────────────────────────
// The audit plan originally proposed a double-submit CSRF token (server
// sets a non-HttpOnly cookie; client JS reads it and reflects it in an
// `X-CSRF-Token` header on every mutation). That works, but requires:
//   - DB column or in-memory token store
//   - Client-side header injection wired into every RPC call
//   - Token rotation on login
// Origin validation achieves the same end (block cross-origin mutations)
// with zero client-side code change and no schema migration. The Origin
// header is unforgeable from JS, so it's not weaker than a token. We can
// stack double-submit on top later if a specific risk requires it.

import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";

import "@/core/db/env";

/**
 * Reject the request if its Origin (or Referer fallback) does not match
 * the deployed BASE_URL host. Call this at the top of every server
 * function handler that mutates state (POST/PUT/DELETE).
 *
 * Throws a structured 403 Error matching the `requireSession()` convention
 * so TanStack Start's error transport surfaces it consistently.
 */
export function requireSafeOrigin(): void {
  const req = getRequest();
  const method = req.method.toUpperCase();
  // Safe methods (GET / HEAD / OPTIONS) don't require CSRF protection by
  // definition — they shouldn't mutate state. Skip for hot path.
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;

  const expectedHost = safeHostFromUrl(env.BASE_URL);
  if (!expectedHost) {
    // Misconfiguration — BASE_URL must be set for CSRF to work. Fail-closed.
    throw forbidden("csrf_misconfigured", "BASE_URL is not set; cannot validate Origin.");
  }

  const origin = req.headers.get("origin");
  if (origin) {
    const originHost = safeHostFromUrl(origin);
    if (originHost === expectedHost) return;
    throw forbidden("csrf_origin_mismatch", `Origin ${originHost ?? "(invalid)"} ≠ ${expectedHost}`);
  }

  // Origin missing — fall back to Referer (rare but valid).
  const referer = req.headers.get("referer");
  if (referer) {
    const refererHost = safeHostFromUrl(referer);
    if (refererHost === expectedHost) return;
    throw forbidden("csrf_referer_mismatch", `Referer ${refererHost ?? "(invalid)"} ≠ ${expectedHost}`);
  }

  // Neither Origin nor Referer present on a state-changing request.
  // Modern browsers always send one; absence is highly suspicious.
  throw forbidden("csrf_no_origin", "Missing Origin and Referer on state-changing request.");
}

function safeHostFromUrl(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

function forbidden(code: string, message: string): Error {
  return Object.assign(new Error(message), { statusCode: 403, code });
}
