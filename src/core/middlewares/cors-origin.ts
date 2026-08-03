// Pure origin predicate, split out of cors.ts so it can be unit-tested without
// pulling the `cloudflare:workers` env binding (which bun:test can't resolve).

// Anchored: matches a bare localhost/127.0.0.1/[::1] origin with an optional
// port and nothing else — so `http://localhost.evil.com` does NOT match.
const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/** True for a loopback preview origin (used by the landing SEO prerender). */
export function isLocalhostOrigin(origin: string | null): boolean {
  return !!origin && LOCALHOST_ORIGIN.test(origin);
}

// ── Public browser mutation boundary (CMS-P1) ───────────────────────────────
//
// `getAllowedOrigin` in cors.ts decides which origin to ECHO on a response. It
// never rejects, so it cannot answer "may this browser mutate?" — a request
// from an unlisted origin still runs the handler in full, and a CORS-simple
// POST (no preflight) reaches the store regardless of the header we echo back.
// The predicate below answers the mutation question instead, and is pure so
// production behaviour can be asserted without a Worker runtime.

/** Canonical `scheme://host[:port]` form of an origin, or null when the value is
 *  absent, unparseable, or opaque (`Origin: null` from a sandboxed document).
 *
 *  `URL.origin` lowercases scheme and host and drops the default port, which is
 *  what makes the comparison in `isAllowedMutationOrigin` an EXACT match on a
 *  normalized value — never a prefix, suffix, substring or subdomain pattern.
 *  `https://thgfulfill.com.evil.example` and `https://evil-thgfulfill.com`
 *  normalize to themselves and simply are not in the list. */
export function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  let origin: string;
  try {
    ({ origin } = new URL(value));
  } catch {
    return null;
  }
  // Opaque origins serialize to the literal "null"; treat as absent, never as a value to match.
  return origin === "null" ? null : origin;
}

/** Parse `env.CORS_ORIGIN` (comma-separated) into canonical origins. Entries that are not
 *  parseable URLs are dropped rather than matched loosely — a malformed allow-list entry must
 *  not widen the boundary. An empty or absent value yields an empty list, which denies every
 *  origin in production (fail-closed). */
export function parseOriginAllowList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const entry of raw.split(",")) {
    const normalized = normalizeOrigin(entry.trim());
    if (normalized && !out.includes(normalized)) out.push(normalized);
  }
  return out;
}

/** May a browser at `origin` execute a public mutation?
 *
 *  Exact match against the canonical allow-list, plus loopback ONLY when the caller says this
 *  is a non-production build (mirrors `requireSafeOrigin`'s dev wildcard in csrf.ts). A missing
 *  or malformed Origin is denied: every public write endpoint's declared consumer is the
 *  landing browser, and browsers always attach Origin to a cross-origin POST.
 *
 *  This is a BROWSER boundary, not authentication: it constrains what a page in a browser can
 *  do, and does not constrain a client that composes its own HTTP headers. */
export function isAllowedMutationOrigin(
  origin: string | null | undefined,
  allowList: readonly string[],
  options: { allowLoopback: boolean },
): boolean {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  if (allowList.includes(normalized)) return true;
  return options.allowLoopback && isLocalhostOrigin(normalized);
}

/** Brand marking a route handler as carrying the mutation-origin boundary. Non-enumerable where
 *  it is set, so it never reaches a response body, a log line or a JSON serialization.
 *
 *  The brand and its reader live in THIS module, not in cors.ts, for the reason this file exists
 *  at all: cors.ts binds `cloudflare:workers` at import time, and the public-surface gate must
 *  read the brand without booting the Worker runtime. `withMutationOriginBoundary` (cors.ts) is
 *  the only thing that sets it, and it is the same call that performs the check. */
export const MUTATION_ORIGIN_BOUNDARY = Symbol.for("thg.cors.mutationOriginBoundary");

/** Whether a handler carries the mutation-origin boundary. Used by the public-surface gate to
 *  verify coverage against the route classification.
 *
 *  Requires a FUNCTION: a plain object carrying the symbol is not a handler and must not be able
 *  to satisfy the gate. */
export function hasMutationOriginBoundary(handler: unknown): boolean {
  if (typeof handler !== "function") return false;
  return (handler as unknown as Record<symbol, unknown>)[MUTATION_ORIGIN_BOUNDARY] === true;
}
