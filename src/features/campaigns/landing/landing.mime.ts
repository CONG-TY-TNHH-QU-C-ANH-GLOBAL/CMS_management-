// Content-Type and caching for files served on the landing host. Every type is
// set explicitly from the extension (the bundle allow-list guarantees one
// exists) and nosniff is always sent, so a browser never guesses.

import { extensionOf } from "./landing.bundle";

const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  avif: "image/avif",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  mp4: "video/mp4",
  webm: "video/webm",
  txt: "text/plain; charset=utf-8",
};

export function contentTypeFor(path: string): string {
  return CONTENT_TYPES[extensionOf(path)] ?? "application/octet-stream";
}

/** A build-tool fingerprint in the file name: `app.3f9a1c2b.js`, `logo-8KJ2xQ1a.png`. */
const HASHED_NAME = /[.-][A-Za-z0-9_]{8,}\.[a-z0-9]+$/;

/** Hashed only when the fingerprint mixes digits and letters, so `christmas-collection.jpg`
 *  (a plain long word) is not mistaken for an immutable asset. */
export function isHashedAssetName(path: string): boolean {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const match = HASHED_NAME.exec(base);
  if (!match) return false;
  const fingerprint = match[0].slice(1, match[0].lastIndexOf("."));
  return /\d/.test(fingerprint) && /[A-Za-z]/.test(fingerprint);
}

export type ServeMode = "live" | "preview";

/**
 * Live URLs (/<slug>/...) are NOT versioned — publishing a new version changes what the same
 * URL returns — so only fingerprinted names may be cached for long. HTML is short so a
 * publish or rollback shows within a minute.
 *
 * Preview URLs embed the immutable version id, so every file under them is immutable; they
 * are private because the URL is the only credential.
 */
export function cacheControlFor(path: string, mode: ServeMode): string {
  const html = extensionOf(path) === "html";
  if (mode === "preview") return html ? "private, no-cache" : "private, max-age=86400";
  if (html) return "public, max-age=60";
  if (isHashedAssetName(path)) return "public, max-age=31536000, immutable";
  return "public, max-age=3600";
}

/** Headers every landing-host response carries, error pages included. */
export const BASE_LANDING_HEADERS: Readonly<Record<string, string>> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};
