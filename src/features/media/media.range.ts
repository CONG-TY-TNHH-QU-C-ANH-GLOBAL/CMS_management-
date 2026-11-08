// HTTP Range parsing for the public media proxy, so PDF viewers (pdf.js) can fetch just the
// pages they need from a large file instead of downloading all of it first.

export type ByteRange = { offset: number; length: number };

/**
 * `undefined` = no usable Range header (serve the whole object, 200);
 * `null`      = a Range was sent but cannot be satisfied (416);
 * otherwise the first requested range. Multi-range requests fall back to the whole object.
 */
export function parseByteRange(header: string | null, size: number): ByteRange | null | undefined {
  if (!header) return undefined;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return undefined;
  const [, startText, endText] = m;
  if (startText === "" && endText === "") return undefined;

  if (startText === "") {
    // Suffix range: the last N bytes.
    const n = Number(endText);
    if (!Number.isFinite(n) || n <= 0) return null;
    const length = Math.min(n, size);
    return size === 0 ? null : { offset: size - length, length };
  }
  const start = Number(startText);
  if (!Number.isFinite(start) || start >= size) return null;
  const end = endText === "" ? size - 1 : Math.min(Number(endText), size - 1);
  if (!Number.isFinite(end) || end < start) return null;
  return { offset: start, length: end - start + 1 };
}
