// Pure helpers for chunked (R2 multipart) media uploads. Shared by the Worker routes and the
// admin browser client so both sides agree on part size and limits.

/** R2 requires every part except the last to be >= 5 MiB and all non-final parts equal size. */
export const CHUNK_PART_BYTES = 8 * 1024 * 1024;
/** Hard ceiling for one chunked upload. */
export const CHUNKED_MAX_BYTES = 100 * 1024 * 1024;
/** Files at or below this go through the simple single-request upload. */
export const CHUNKED_THRESHOLD_BYTES = 5 * 1024 * 1024;

export function countParts(size: number): number {
  return Math.max(1, Math.ceil(size / CHUNK_PART_BYTES));
}

/** `<tag>/<id>-<name>.<ext>` as produced by uploadMedia: no traversal, no empty or odd segments. */
const MEDIA_KEY = /^[a-z0-9][a-z0-9_-]{0,63}\/[a-z0-9]{1,16}-[a-z0-9._-]{1,100}\.[a-z0-9]{1,10}$/i;
export function isSafeMediaKey(key: unknown): key is string {
  return typeof key === "string" && key.length <= 200 && !key.includes("..") && MEDIA_KEY.test(key);
}

export interface UploadedPart {
  partNumber: number;
  etag: string;
}

/** Parts must be exactly 1..n in order, with non-empty etags, and n within the size's part count. */
export function validateParts(parts: unknown, size: number): parts is UploadedPart[] {
  if (!Array.isArray(parts) || parts.length === 0 || parts.length !== countParts(size)) return false;
  return parts.every(
    (p, i) =>
      p && typeof p === "object" && p.partNumber === i + 1 && typeof p.etag === "string" && p.etag.length > 0,
  );
}
