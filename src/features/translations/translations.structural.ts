// PURE: post-parse structural validation + JSON parse recovery.
// See docs/ai-localization-spec.md §4.3 + §4.4.

/** Try to parse a string as JSON, stripping common AI wrappers:
 *   - ```json … ``` markdown fences
 *   - prose preamble: "Here is the translation: {…}"
 *   - trailing prose: "{…} Let me know if you need anything else."
 *  Greedy outermost `{…}` extraction. Returns null on failure. */
export function tryParseJson(s: string): Record<string, unknown> | null {
  if (!s) return null;
  // Match the outermost {...} block in the response. Handles fenced code
  // blocks AND prose-wrapped JSON in one pass.
  const match = s.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/** Check that the parsed locale block has every field key from the source.
 *  Returns false if any required key is missing OR not a string. */
export function hasAllExpectedFields(
  localeFields: unknown,
  source: Record<string, string>,
): localeFields is Record<string, string> {
  if (!localeFields || typeof localeFields !== "object" || Array.isArray(localeFields)) {
    return false;
  }
  const obj = localeFields as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    if (typeof obj[key] !== "string") return false;
  }
  return true;
}

/** Loose structural validation. Catches obvious corruption (bullets dropped,
 *  headings missing, whole paragraphs absent). NOT strict — translations
 *  vary by length and word count by design. False-positives (rejecting a
 *  good translation) cost more than false-negatives (letting through
 *  slightly imperfect copy that the operator will edit anyway). */
export function passesStructuralChecks(
  translated: Record<string, string>,
  source: Record<string, string>,
): boolean {
  for (const key of Object.keys(source)) {
    const src = source[key];
    const dst = translated[key];
    if (typeof dst !== "string") return false;
    if (dst.length === 0 && src.length > 0) return false;

    // Bullet count must match — don't let AI drop list items.
    const srcBullets = (src.match(/^[ \t]*[-*+]\s/gm) ?? []).length;
    const dstBullets = (dst.match(/^[ \t]*[-*+]\s/gm) ?? []).length;
    if (srcBullets !== dstBullets) return false;

    // Heading count must match (`#`, `##`, `###`).
    const srcHeadings = (src.match(/^#{1,6}\s/gm) ?? []).length;
    const dstHeadings = (dst.match(/^#{1,6}\s/gm) ?? []).length;
    if (srcHeadings !== dstHeadings) return false;

    // Line count rough match within ±20% (translations often slightly
    // shorter/longer per line — loose threshold).
    const srcLines = src.split("\n").length;
    const dstLines = dst.split("\n").length;
    if (Math.abs(srcLines - dstLines) / Math.max(srcLines, 1) > 0.2) return false;
  }
  return true;
}
