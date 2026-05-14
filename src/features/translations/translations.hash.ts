// PURE: source-content normalization + sha256 hashing for stale detection.
// Hash NORMALIZED content, not raw — cosmetic edits (trailing whitespace,
// CRLF flips, double-space, bullet spacing) must not invalidate approved
// translations. See docs/ai-localization-spec.md §3.2.

/** Normalize a single field for hashing. Order matters:
 *    1. Convert CRLF / CR → LF
 *    2. Trim trailing whitespace on each LINE (preserve line count)
 *    3. Normalize markdown bullet spacing: "-  item" / "*   item" → "- item"
 *    4. Trim leading/trailing whitespace overall
 *    5. Collapse runs of spaces/tabs (but NOT newlines) to a single space
 *  We intentionally do NOT lowercase — case carries meaning in some locales.
 *  We intentionally do NOT strip emoji or punctuation — they're content. */
export function normalizeForHash(s: string): string {
  return s
    .replace(/\r\n|\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/, "")) // trailing whitespace per line
    .map((line) => line.replace(/^(\s*)([-*+])\s+/, "$1$2 ")) // bullet spacing canonical
    .join("\n")
    .trim()
    .replace(/[ \t]+/g, " ");
}

/** sha256 of canonical-ordered, normalized fields, separated by \x1f.
 *  Returns lowercase hex string (64 chars). */
export async function computeSourceHash(fields: Record<string, string>): Promise<string> {
  const sorted = Object.keys(fields).sort();
  const joined = sorted.map((k) => `${k}=${normalizeForHash(fields[k] ?? "")}`).join("\x1f");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(joined));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
