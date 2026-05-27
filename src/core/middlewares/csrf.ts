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
// CANONICAL HOST LIST
// ───────────────────
// Production CMS is reachable on more than one canonical host:
//   - `env.BASE_URL` is the primary production host (e.g. cms.thgfulfill.com)
//   - `env.CSRF_ALLOWED_ORIGINS` (comma-separated, full URL or bare host)
//     lists additional accepted hosts: preview deploys on *.workers.dev,
//     custom admin domain, staging.
//   - In dev (`!import.meta.env.PROD`) we auto-allow localhost / 127.0.0.1
//     on ANY port so `bun dev` and `vite preview` work without operator config.
// Operators MUST list every domain the admin UI is served from in prod.
// Anything not on the list is rejected as cross-origin even if it's our own infra.
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
 * Reject the request if its Origin (or Referer fallback) host is not in the
 * accepted canonical-host list. Call this at the top of every server
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

  const check = buildHostCheck();
  if (!check.hasAny) {
    // Misconfiguration — at least one canonical host required for CSRF to work. Fail-closed.
    throw forbidden(
      "csrf_misconfigured",
      "Neither BASE_URL nor CSRF_ALLOWED_ORIGINS is set; cannot validate Origin.",
    );
  }

  const origin = req.headers.get("origin");
  if (origin) {
    const originHost = safeHostFromUrl(origin);
    if (originHost && check.allows(originHost)) return;
    throw forbidden(
      "csrf_origin_mismatch",
      `Origin ${originHost ?? "(invalid)"} not in allowed list`,
    );
  }

  // Origin missing — fall back to Referer (rare but valid).
  const referer = req.headers.get("referer");
  if (referer) {
    const refererHost = safeHostFromUrl(referer);
    if (refererHost && check.allows(refererHost)) return;
    throw forbidden(
      "csrf_referer_mismatch",
      `Referer ${refererHost ?? "(invalid)"} not in allowed list`,
    );
  }

  // Neither Origin nor Referer present on a state-changing request.
  // Modern browsers always send one; absence is highly suspicious.
  throw forbidden("csrf_no_origin", "Missing Origin and Referer on state-changing request.");
}

interface HostCheck {
  hasAny: boolean;
  allows: (host: string) => boolean;
}

/**
 * Build the host-allow predicate. Recomputed per-request because env is a
 * Worker binding — cheap and avoids any module-init ordering issue.
 *
 * Exact-match against:
 *   - URL.host of `env.BASE_URL`
 *   - each entry in `env.CSRF_ALLOWED_ORIGINS` (full URL or bare host[:port])
 * Plus the dev wildcard (`!import.meta.env.PROD`): any localhost / 127.0.0.1
 * regardless of port. Vite tree-shakes the dev branch out of prod bundles.
 */
function buildHostCheck(): HostCheck {
  const exact = new Set<string>();
  const base = safeHostFromUrl(env.BASE_URL);
  if (base) exact.add(base.toLowerCase());

  if (env.CSRF_ALLOWED_ORIGINS) {
    for (const raw of env.CSRF_ALLOWED_ORIGINS.split(",")) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      // Accept either a full URL ("https://preview.foo.workers.dev") or a
      // bare host ("preview.foo.workers.dev[:8787]"). URL.host returns the
      // empty string for bare hosts, so fall back to a regex shape check.
      const fromUrl = safeHostFromUrl(trimmed);
      if (fromUrl) {
        exact.add(fromUrl.toLowerCase());
      } else if (/^[a-zA-Z0-9.-]+(:\d+)?$/.test(trimmed)) {
        exact.add(trimmed.toLowerCase());
      }
    }
  }

  const devWildcard = !import.meta.env.PROD;
  const hasAny = exact.size > 0 || devWildcard;

  return {
    hasAny,
    allows: (host: string): boolean => {
      const h = host.toLowerCase();
      if (exact.has(h)) return true;
      if (devWildcard) {
        // Strip optional :port and match localhost / 127.0.0.1 on any port.
        const colon = h.lastIndexOf(":");
        const bare = colon > 0 ? h.slice(0, colon) : h;
        if (bare === "localhost" || bare === "127.0.0.1") return true;
      }
      return false;
    },
  };
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
