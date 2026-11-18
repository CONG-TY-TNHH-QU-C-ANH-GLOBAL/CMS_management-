// Shared by the browser-side workbook parser and the server-side save, so the
// server never has to import the xlsx library.

/** The 24 weight ceilings (oz) every tier must list, in this order. */
export const USPS_GA_WEIGHTS: readonly number[] = [
  4,
  8,
  12,
  15.999,
  ...Array.from({ length: 20 }, (_, i) => (i + 1) * 16),
];

/** CMS rate-card slugs for Tier 1..5 (seeded by migration 0071). */
export const USPS_GA_SLUGS: readonly string[] = [1, 2, 3, 4, 5].map((n) => `uspsGaLabelT${n}`);

export interface UspsGaRow {
  /** Weight ceiling in ounces, as a number (the sheet shows it as "4 oz"). */
  oz: number;
  g: number;
  z1: number;
  z2: number;
  z3: number;
  z4: number;
  z5: number;
  z6: number;
  z7: number;
  z8: number;
  z9: number;
}
