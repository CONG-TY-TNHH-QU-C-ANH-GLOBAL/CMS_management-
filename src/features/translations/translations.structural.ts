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

    // JSON-valued fields (e.g. responsibilities_json, payload_json) are NOT
    // markdown — bullet/heading/line heuristics are meaningless on them and
    // were a major false-failure source (esp. careers_job). Validate only that
    // the translation is still parseable JSON; structure is checked by callers.
    if (key.endsWith("_json")) {
      if (dst.trim().length === 0) continue;
      try {
        JSON.parse(dst);
      } catch {
        return false;
      }
      continue;
    }

    // Bullet count must match — don't let AI drop list items.
    const srcBullets = (src.match(/^[ \t]*[-*+]\s/gm) ?? []).length;
    const dstBullets = (dst.match(/^[ \t]*[-*+]\s/gm) ?? []).length;
    if (srcBullets !== dstBullets) return false;

    // Heading count must match (`#`, `##`, `###`).
    const srcHeadings = (src.match(/^#{1,6}\s/gm) ?? []).length;
    const dstHeadings = (dst.match(/^#{1,6}\s/gm) ?? []).length;
    if (srcHeadings !== dstHeadings) return false;

    // NOTE: the old ±20% line-count check was removed — legitimate
    // localizations (esp. compact ZH or wrapped VI) routinely differ by more
    // than 20% in line count, which marked good translations as `failed`. The
    // bullet + heading guards above still catch real structural corruption.
  }
  return true;
}
