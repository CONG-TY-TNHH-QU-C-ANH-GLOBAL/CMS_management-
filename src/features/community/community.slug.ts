// Slug helpers for community questions — pure functions (DB-free, testable).

/** Vietnamese-safe slugifier: strips diacritics (đ→d), keeps [a-z0-9],
 *  collapses everything else into single dashes. Implemented as a character
 *  loop (no regex) — Sonar S8786 flags `-+$`-style patterns as super-linear. */
export function slugify(title: string): string {
  const MAX = 80;
  let out = "";
  let pendingDash = false;
  for (const ch of title.normalize("NFD")) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x0300 && code <= 0x036f) continue; // combining diacritic
    const lower = ch === "đ" || ch === "Đ" ? "d" : ch.toLowerCase();
    const cc = lower.charCodeAt(0);
    const isAlnum =
      lower.length === 1 && ((cc >= 97 && cc <= 122) || (cc >= 48 && cc <= 57));
    if (!isAlnum) {
      pendingDash = true; // collapse runs; also drops leading/trailing dashes
      continue;
    }
    if (pendingDash && out.length > 0) out += "-";
    pendingDash = false;
    if (out.length >= MAX) break;
    out += lower;
  }
  // A dash may have been appended right at the cap — never end on one.
  if (out.endsWith("-")) out = out.slice(0, -1);
  return out || "cau-hoi";
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
