/**
 * Resolve a `media.r2_key` into something a browser can load.
 *
 * `r2_key` holds one of two things: an R2 object key, or an absolute external
 * URL — blog.service.ts upserts remote images that way ("external URL
 * convention"), so both forms are already in the media table today.
 *
 * The landing sets these values straight onto `<img src>` (BlogPage maps
 * `thumbnail_url` to `thumbnail` with no rewriting), so a bare R2 key resolves
 * against the LANDING origin and 404s. Absolutising server-side is what makes an
 * uploaded logo render. /api/v1/integrations returns the raw `logo_media_id`
 * instead, which is why that strip has never displayed a logo.
 *
 * `origin` comes from the request rather than an env var so a preview
 * deployment serves preview URLs with no extra configuration.
 */
export function toMediaUrl(r2Key: string | null | undefined, origin: string): string | null {
  if (!r2Key) return null;
  const key = r2Key.trim();
  if (key === "") return null;
  // Already absolute — pass through untouched, including the query string an
  // external CDN may carry.
  if (/^https?:\/\//i.test(key)) return key;
  // encodeURIComponent, not encodeURI: the key contains slashes that must be
  // percent-encoded, because the proxy route reads the whole key as ONE path
  // segment (`/api/v1/media/$`). Production blog URLs show this — the live
  // payload contains `blog-bot%2F…`, not `blog-bot/…`.
  return `${origin}/api/v1/media/${encodeURIComponent(key)}`;
}
