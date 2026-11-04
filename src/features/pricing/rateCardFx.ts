// Rate Card Builder — exchange rate (VND per 1 USD) kept on the table itself.
//
// Pure module: no React, no I/O. The rate lives in `schema_json.fx_rate` so it
// is versioned with the table, survives publish/rollback, and reaches the
// landing through the existing /api/v1/pricing/{slug} payload (landing ignores
// unknown schema keys, so this is additive). Unset means "no conversion
// offered" — nothing is assumed, a wrong default rate would misquote prices.

import {
  toNumberOrNull,
  type GridConfig,
  type RateCardColumn,
  type RateCardRow,
  type SemanticType,
} from "./rateCardTypes";

export const FX_RATE_KEY = "fx_rate";

/** Direction of a whole-grid currency conversion. */
export type FxDirection = "vnd_to_usd" | "usd_to_vnd";

const MIN_RATE = 1000;
const MAX_RATE = 1_000_000;

/** A usable rate is a finite number in a sane VND-per-USD band. The band stops
 *  a typo ("25.4" instead of "25400") from reaching the public page. */
export function isValidFxRate(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= MIN_RATE && n <= MAX_RATE;
}

/** Read the stored rate from a parsed schema object; null when absent/invalid. */
export function readFxRate(schema: unknown): number | null {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return null;
  const v = (schema as Record<string, unknown>)[FX_RATE_KEY];
  return isValidFxRate(v) ? v : null;
}

/** Parse operator input: "25400", "25,400", "25.400" (vi grouping) or "25400.5".
 *  Returns null for empty/unparseable. Range is checked by `isValidFxRate`. */
export function parseFxInput(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, "");
  if (s === "") return null;
  let normalized = s;
  if (/^\d{1,3}(\.\d{3})+$/.test(s))
    normalized = s.replace(/\./g, ""); // 25.400 → 25400
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s))
    normalized = s.replace(/,/g, ""); // 25,400.5
  else if (/^\d+,\d+$/.test(s)) normalized = s.replace(",", "."); // 25400,5
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function vndToUsd(vnd: number, rate: number): number {
  return vnd / rate;
}

export function usdToVnd(usd: number, rate: number): number {
  return usd * rate;
}

/** Convert in the chosen direction; null when the rate is unusable. */
export function convertFx(
  amount: number,
  direction: FxDirection,
  rate: number | null,
): number | null {
  if (!isValidFxRate(rate) || !Number.isFinite(amount)) return null;
  return direction === "vnd_to_usd" ? vndToUsd(amount, rate) : usdToVnd(amount, rate);
}

/** Return `schema` with the rate set, or removed when null. Never mutates. */
export function withFxRate(
  schema: Record<string, unknown>,
  rate: number | null,
): Record<string, unknown> {
  const { [FX_RATE_KEY]: _old, ...rest } = schema;
  void _old;
  return isValidFxRate(rate) ? { ...rest, [FX_RATE_KEY]: rate } : rest;
}

export interface GridCurrencyConversion {
  rows: RateCardRow[];
  cols: RateCardColumn[];
  /** `${rowIndex}:${code}` for every cell whose value changed. */
  changedCells: string[];
  /** Number of price cells converted. */
  converted: number;
  /** Table currency after the conversion. */
  currency: "VND" | "USD";
}

/**
 * Convert every money cell of the grid to the other currency at `rate`
 * (VND per 1 USD). Only columns whose semantic matches the source currency are
 * touched; the weight column and text cells ("Liên hệ") are left as they are.
 * USD is rounded to cents and VND to whole đồng — the same precision the
 * validator and the landing expect for each currency. Converted columns are
 * re-tagged with the target semantic/currency so validation and display follow.
 * Returns null when the rate is unusable.
 */
export function convertGridCurrency(
  rows: RateCardRow[],
  cols: RateCardColumn[],
  config: GridConfig,
  rate: number | null,
  direction: FxDirection,
): GridCurrencyConversion | null {
  if (!isValidFxRate(rate)) return null;
  const toUsd = direction === "vnd_to_usd";
  const from: SemanticType = toUsd ? "money_vnd" : "money_usd";
  const to: SemanticType = toUsd ? "money_usd" : "money_vnd";
  const targets = new Set(config.priceCols.filter((c) => config.semanticByCol[c] === from));

  const changedCells: string[] = [];
  const nextRows = rows.map((row, i) => {
    const next = { ...row };
    for (const code of targets) {
      const n = toNumberOrNull(row[code]);
      if (n === null) continue;
      next[code] = toUsd
        ? Math.round(vndToUsd(n, rate) * 100) / 100
        : Math.round(usdToVnd(n, rate));
      changedCells.push(`${i}:${code}`);
    }
    return next;
  });

  return {
    rows: nextRows,
    cols: cols.map((c) =>
      targets.has(c.code) ? { ...c, semantic: to, currency: toUsd ? "USD" : "VND" } : c,
    ),
    changedCells,
    converted: changedCells.length,
    currency: toUsd ? "USD" : "VND",
  };
}
