// Slug helpers for community questions — pure functions (DB-free, testable).

/** Vietnamese-safe slugifier: strips diacritics (đ→d), keeps [a-z0-9-]. */
export function slugify(title: string): string {
  const base = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return base || "cau-hoi";
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
