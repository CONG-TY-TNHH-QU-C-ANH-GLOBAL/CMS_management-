// Slug helpers for community questions — pure functions (DB-free, testable).

/** Unicode combining diacritic (what NFD splits off Vietnamese letters). */
function isCombiningMark(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return code >= 0x0300 && code <= 0x036f;
}

/** Maps one NFD-normalized char to its slug form: an ascii [a-z0-9] char,
 *  or null when the char is a separator (anything else). đ/Đ become d. */
function toAsciiSlugChar(char: string): string | null {
  const lower = char === "đ" || char === "Đ" ? "d" : char.toLowerCase();
  if (lower.length !== 1) return null;
  const code = lower.codePointAt(0) ?? 0;
  const isAlnum = (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
  return isAlnum ? lower : null;
}

/** A dash can land right at the length cap — never end on one. */
function trimTrailingDash(value: string): string {
  return value.endsWith("-") ? value.slice(0, -1) : value;
}

/** Vietnamese-safe slugifier: strips diacritics (đ→d), keeps [a-z0-9],
 *  collapses everything else into single dashes, caps at 80 chars.
 *  Implemented regex-free (Sonar S8786 flags backtracking patterns). */
export function slugify(title: string): string {
  const MAX = 80;
  let out = "";
  let pendingDash = false;
  for (const ch of title.normalize("NFD")) {
    if (isCombiningMark(ch)) continue;
    const slugChar = toAsciiSlugChar(ch);
    if (slugChar === null) {
      pendingDash = true; // collapse runs; also drops leading/trailing dashes
      continue;
    }
    if (pendingDash && out.length > 0) out += "-";
    pendingDash = false;
    if (out.length >= MAX) break;
    out += slugChar;
  }
  return trimTrailingDash(out) || "cau-hoi";
}

/** Picks `base`, then `base-2`…`base-99`, then a random suffix — first one
 *  not present in `existing`. */
export function pickAvailableSlug(base: string, existing: ReadonlySet<string>): string {
  if (!existing.has(base)) return base;
  for (let n = 2; n < 100; n++) {
    if (!existing.has(`${base}-${n}`)) return `${base}-${n}`;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}
