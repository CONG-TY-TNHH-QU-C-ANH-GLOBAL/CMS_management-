// Pure: no DB access, safe for the admin UI and the public route alike.

/** What the site shows for one product: its own flag, else the catalog-wide default. */
export function resolvePriceIncludesShipping(
  flag: 0 | 1 | null | undefined,
  catalogDefault: boolean,
): boolean {
  return flag === 0 || flag === 1 ? flag === 1 : catalogDefault;
}
