// Rate Card Builder — formula generator.
//
// Pure module. Generates weight→price rows from a linear formula
// (price = basePrice + incrementPerStep * stepIndex) with rounding, and
// applies them to a grid via replace / fill-empty / selected-range modes.

import { parseLocaleNumber } from "./rateCardParse";
import type { RateCardColumn, RateCardRow } from "./rateCardTypes";

/** Rounding snap unit; 0 = no snap (integer round only). */
export type RoundingUnit = 0 | 1000 | 10000 | 100000;

export type FormulaApplyMode = "replace_all" | "fill_empty" | "selected_range";

export interface FormulaSpec {
  startWeight: number;
  endWeight: number;
  step: number;
  basePrice: number;
  incrementPerStep: number;
  rounding: RoundingUnit;
  weightCol: string;
  priceCol: string;
  applyMode: FormulaApplyMode;
}

export interface FormulaApplyResult {
  rows: RateCardRow[];
  changedCells: string[];
  /** Number of rows whose target value changed/was created. */
  affected: number;
  notes: string[];
}

export function roundTo(value: number, unit: RoundingUnit): number {
  if (unit === 0) return Math.round(value);
  return Math.round(value / unit) * unit;
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Validate a spec; returns an error message or null. */
export function validateFormulaSpec(spec: FormulaSpec): string | null {
  if (!Number.isFinite(spec.startWeight) || !Number.isFinite(spec.endWeight))
    return "Cân nặng bắt đầu/kết thúc không hợp lệ";
  if (!Number.isFinite(spec.step) || spec.step <= 0) return "Bước nhảy phải > 0";
  if (spec.endWeight < spec.startWeight) return "Cân nặng kết thúc phải ≥ bắt đầu";
  if (!Number.isFinite(spec.basePrice)) return "Giá gốc không hợp lệ";
  if (!Number.isFinite(spec.incrementPerStep)) return "Mức cộng thêm không hợp lệ";
  if ((spec.endWeight - spec.startWeight) / spec.step > 10000)
    return "Quá nhiều dòng (>10000) — kiểm tra lại bước nhảy";
  return null;
}

/** Number of steps (inclusive of both ends). */
function stepCount(spec: FormulaSpec): number {
  return Math.floor(round6((spec.endWeight - spec.startWeight) / spec.step)) + 1;
}

/** Price at a given step index. */
export function priceAtIndex(spec: FormulaSpec, i: number): number {
  return roundTo(spec.basePrice + spec.incrementPerStep * i, spec.rounding);
}

/** Compute the formula price for an arbitrary weight; null if out of grid. */
export function priceForWeight(spec: FormulaSpec, weight: number): number | null {
  const i = round6((weight - spec.startWeight) / spec.step);
  if (i < 0) return null;
  const rounded = Math.round(i);
  if (Math.abs(i - rounded) > 1e-6) return null; // weight not on a step boundary
  if (spec.startWeight + rounded * spec.step > spec.endWeight + 1e-9) return null;
  return priceAtIndex(spec, rounded);
}

/** Generate the full set of {weightCol, priceCol} rows for the spec. */
export function generateFormulaRows(spec: FormulaSpec): RateCardRow[] {
  const n = stepCount(spec);
  const rows: RateCardRow[] = [];
  for (let i = 0; i < n; i++) {
    const weight = round6(spec.startWeight + i * spec.step);
    rows.push({ [spec.weightCol]: weight, [spec.priceCol]: priceAtIndex(spec, i) });
  }
  return rows;
}

function emptyRow(columns: RateCardColumn[]): RateCardRow {
  const r: RateCardRow = {};
  for (const c of columns) r[c.code] = "";
  return r;
}

function isEmpty(v: unknown): boolean {
  return v === "" || v === null || v === undefined;
}

/**
 * Apply the formula to a grid. Pure — returns a new rows array.
 * - replace_all: grid becomes exactly the generated rows (other columns blank).
 * - fill_empty: only rows whose priceCol is empty get a computed price.
 * - selected_range: rows at `selectedIndices` get a computed price.
 */
export function applyFormula(
  rows: RateCardRow[],
  columns: RateCardColumn[],
  spec: FormulaSpec,
  selectedIndices: number[] = [],
): FormulaApplyResult {
  const notes: string[] = [];
  const changedCells: string[] = [];

  if (spec.applyMode === "replace_all") {
    const generated = generateFormulaRows(spec);
    const newRows = generated.map((g) => ({ ...emptyRow(columns), ...g }));
    for (let i = 0; i < newRows.length; i++) {
      changedCells.push(`${i}:${spec.weightCol}`, `${i}:${spec.priceCol}`);
    }
    return { rows: newRows, changedCells, affected: newRows.length, notes };
  }

  const next = rows.map((r) => ({ ...r }));
  let affected = 0;
  const targets = spec.applyMode === "selected_range" ? new Set(selectedIndices) : null; // fill_empty considers all rows

  for (let i = 0; i < next.length; i++) {
    if (targets && !targets.has(i)) continue;
    if (spec.applyMode === "fill_empty" && !isEmpty(next[i][spec.priceCol])) continue;

    const w = parseLocaleNumber(next[i][spec.weightCol]);
    if (w === null) {
      notes.push(`Dòng ${i + 1}: cân nặng không phải số — bỏ qua`);
      continue;
    }
    const price = priceForWeight(spec, w);
    if (price === null) {
      notes.push(`Dòng ${i + 1}: cân nặng ${w} ngoài khoảng công thức — bỏ qua`);
      continue;
    }
    if (next[i][spec.priceCol] !== price) {
      next[i][spec.priceCol] = price;
      changedCells.push(`${i}:${spec.priceCol}`);
      affected++;
    }
  }

  return { rows: next, changedCells, affected, notes };
}
