// Pure origin predicate, split out of cors.ts so it can be unit-tested without
// pulling the `cloudflare:workers` env binding (which bun:test can't resolve).

// Anchored: matches a bare localhost/127.0.0.1/[::1] origin with an optional
// port and nothing else — so `http://localhost.evil.com` does NOT match.
const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/** True for a loopback preview origin (used by the landing SEO prerender). */
export function isLocalhostOrigin(origin: string | null): boolean {
  return !!origin && LOCALHOST_ORIGIN.test(origin);
}
