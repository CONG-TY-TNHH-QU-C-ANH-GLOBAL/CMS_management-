// Rate Card Builder — mass update (bulk price operations).
//
// Pure module. Applies a scoped arithmetic operation + rounding to one price
// column and reports an impact preview (affected rows, min/max old/new,
// largest % change). Non-numeric cells (e.g. "Liên hệ") are skipped.

import { parseLocaleNumber } from "./rateCardParse";
import type { RateCardRow } from "./rateCardTypes";

export type MassScope =
  | { type: "all" }
  | { type: "selected"; indices: number[] }
  | { type: "weight_range"; from: number; to: number };

export type MassOp =
  | { type: "increase_pct"; value: number }
  | { type: "decrease_pct"; value: number }
  | { type: "add"; value: number }
  | { type: "subtract"; value: number }
  | { type: "multiply"; value: number }
  | { type: "round" };

export type MassRounding = "none" | "nearest_1000" | "ceil_1000" | "floor_1000" | "nearest_10000";

export interface MassUpdateSpec {
  scope: MassScope;
  operation: MassOp;
  rounding: MassRounding;
  weightCol: string;
  priceCol: string;
}

export interface MassUpdatePreview {
  affectedRows: number;
  skippedRows: number;
  oldMin: number | null;
  oldMax: number | null;
  newMin: number | null;
  newMax: number | null;
  largestChangePct: number | null;
}

export interface MassUpdateResult {
  rows: RateCardRow[];
  changedCells: string[];
  preview: MassUpdatePreview;
  notes: string[];
}

export function applyRounding(value: number, rounding: MassRounding): number {
  switch (rounding) {
    case "nearest_1000":
      return Math.round(value / 1000) * 1000;
    case "ceil_1000":
      return Math.ceil(value / 1000) * 1000;
    case "floor_1000":
      return Math.floor(value / 1000) * 1000;
    case "nearest_10000":
      return Math.round(value / 10000) * 10000;
    case "none":
    default:
      return Math.round(value);
  }
}

function applyOp(value: number, op: MassOp): number {
  switch (op.type) {
    case "increase_pct":
      return value * (1 + op.value / 100);
    case "decrease_pct":
      return value * (1 - op.value / 100);
    case "add":
      return value + op.value;
    case "subtract":
      return value - op.value;
    case "multiply":
      return value * op.value;
    case "round":
      return value;
  }
}

function inScope(index: number, weight: number | null, scope: MassScope): boolean {
  switch (scope.type) {
    case "all":
      return true;
    case "selected":
      return scope.indices.includes(index);
    case "weight_range":
      return weight !== null && weight >= scope.from && weight <= scope.to;
  }
}

/**
 * Compute the mass update: returns new rows, changed cells, and an impact
 * preview. Pure — does not mutate input. UI uses `preview` before committing
 * `rows` to the draft.
 */
export function computeMassUpdate(rows: RateCardRow[], spec: MassUpdateSpec): MassUpdateResult {
  const next = rows.map((r) => ({ ...r }));
  const changedCells: string[] = [];
  const notes: string[] = [];
  const oldVals: number[] = [];
  const newVals: number[] = [];
  let affected = 0;
  let skipped = 0;
  let largestChangePct: number | null = null;

  for (let i = 0; i < next.length; i++) {
    const weight = parseLocaleNumber(next[i][spec.weightCol]);
    if (!inScope(i, weight, spec.scope)) continue;

    const old = parseLocaleNumber(next[i][spec.priceCol]);
    if (old === null) {
      skipped++;
      continue;
    }

    const computed = applyRounding(applyOp(old, spec.operation), spec.rounding);
    oldVals.push(old);
    newVals.push(computed);

    if (old !== 0) {
      const pct = Math.abs((computed - old) / old) * 100;
      largestChangePct = largestChangePct === null ? pct : Math.max(largestChangePct, pct);
    }

    if (computed !== old) {
      next[i][spec.priceCol] = computed;
      changedCells.push(`${i}:${spec.priceCol}`);
      affected++;
    }
  }

  if (skipped > 0) notes.push(`Bỏ qua ${skipped} dòng có giá không phải số`);

  return {
    rows: next,
    changedCells,
    notes,
    preview: {
      affectedRows: affected,
      skippedRows: skipped,
      oldMin: min(oldVals),
      oldMax: max(oldVals),
      newMin: min(newVals),
      newMax: max(newVals),
      largestChangePct: largestChangePct === null ? null : round2(largestChangePct),
    },
  };
}

function min(xs: number[]): number | null {
  return xs.length ? Math.min(...xs) : null;
}
function max(xs: number[]): number | null {
  return xs.length ? Math.max(...xs) : null;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
