// Rate Card Builder — shared types and grid-config inference.
//
// Pure module: no React, no I/O. All other rateCard* logic modules and the
// UI depend on these types. The data model intentionally mirrors what is
// stored in `pricing_tables.data_json` for `weight_grid` tables: an array of
// row objects keyed by column `code` (e.g. { kg: 0.5, price: 1387634 }).
//
// IMPORTANT: cell values are NOT strictly numeric. The landing consumer reads
// rows like { kg: "21-30", price: "Liên hệ" }, so the model permits strings
// and the validation layer warns (not blocks) on non-numeric values.

export type CellValue = string | number;

export type ColumnType = "number" | "currency" | "text";

export interface RateCardColumn {
  code: string;
  label: string;
  position: number;
  type: ColumnType;
}

/** A logical row: column code → value. No grid-internal `__id` here. */
export type RateCardRow = Record<string, CellValue>;

/** Parsed/derived shape of a weight_grid table's schema_json. */
export interface RateCardSchema {
  type: "weight_grid";
  columns: RateCardColumn[];
  /** Optional currency hint; defaults to VND. Not hard-coded into UI. */
  currency?: string;
  /** Optional declared weight step (kg). Inferred when absent. */
  step?: number;
}

/** Runtime config inferred from columns + data, used across all operations. */
export interface GridConfig {
  /** Code of the leading weight/key column (column 0). */
  weightCol: string;
  /** Codes of numeric/currency value columns (everything but the weight col). */
  priceCols: string[];
  columns: RateCardColumn[];
  /** Inferred uniform weight step, or null when non-uniform / non-numeric. */
  step: number | null;
  currency: string;
}

export type Severity = "critical" | "warning";

export interface ValidationIssue {
  severity: Severity;
  /** Stable machine code, e.g. "duplicate_weight". */
  code: string;
  /** Human (vi) message. */
  message: string;
  /** Row index in the current rows array (when row-scoped). */
  rowIndex?: number;
  /** Column code (when cell-scoped). */
  column?: string;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  criticalCount: number;
  warningCount: number;
  /** Cell-scoped issues keyed as `${rowIndex}:${column}` for inline marking. */
  cellIssues: Map<string, ValidationIssue[]>;
  /** Row-scoped issues keyed by rowIndex. */
  rowIssues: Map<number, ValidationIssue[]>;
}

export type DiffKind = "added" | "removed" | "updated" | "unchanged";

export interface DiffCellChange {
  column: string;
  oldValue: CellValue | undefined;
  newValue: CellValue | undefined;
  /** Absolute change (newNum - oldNum) when both numeric, else null. */
  changeAmount: number | null;
  /** Percent change vs old when both numeric and old !== 0, else null. */
  changePct: number | null;
}

export interface DiffRow {
  kind: DiffKind;
  /** Weight-column key identifying the row (string form). */
  key: string;
  oldRow?: RateCardRow;
  newRow?: RateCardRow;
  /** Per-column changes (only for `updated`). */
  changes: DiffCellChange[];
}

export interface DiffResult {
  rows: DiffRow[];
  added: number;
  removed: number;
  updated: number;
  unchanged: number;
}

export const DEFAULT_PRICE_JUMP_THRESHOLD_PCT = 30;
export const DEFAULT_CURRENCY = "VND";

const WEIGHT_CODE_HINTS = new Set(["kg", "weight", "gram", "g", "bracket", "range"]);

/** Heuristic: is a column code the weight/key column? */
export function isWeightCode(code: string): boolean {
  return WEIGHT_CODE_HINTS.has(code.toLowerCase());
}

/**
 * Infer the runtime grid config from columns + current rows.
 * - weightCol = explicit weight-typed/known code, else column 0.
 * - priceCols = all other columns.
 * - step = the dominant gap between consecutive numeric weights, when uniform.
 */
export function inferGridConfig(
  columns: RateCardColumn[],
  rows: RateCardRow[],
  schema?: Pick<RateCardSchema, "currency" | "step">,
): GridConfig {
  const ordered = [...columns].sort((a, b) => a.position - b.position);
  const weightCol = ordered.find((c) => isWeightCode(c.code))?.code ?? ordered[0]?.code ?? "kg";
  const priceCols = ordered.map((c) => c.code).filter((code) => code !== weightCol);

  const step =
    typeof schema?.step === "number" && schema.step > 0 ? schema.step : inferStep(rows, weightCol);

  return {
    weightCol,
    priceCols,
    columns: ordered,
    step,
    currency: schema?.currency ?? DEFAULT_CURRENCY,
  };
}

/** Infer a uniform weight step from numeric weight values; null if not uniform. */
export function inferStep(rows: RateCardRow[], weightCol: string): number | null {
  const weights: number[] = [];
  for (const r of rows) {
    const n = toNumberOrNull(r[weightCol]);
    if (n !== null) weights.push(n);
  }
  if (weights.length < 2) return null;
  const sorted = [...weights].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const g = round6(sorted[i] - sorted[i - 1]);
    if (g > 0) gaps.push(g);
  }
  if (gaps.length === 0) return null;
  // Dominant (most frequent) gap.
  const counts = new Map<number, number>();
  for (const g of gaps) counts.set(g, (counts.get(g) ?? 0) + 1);
  let best = gaps[0];
  let bestCount = 0;
  for (const [g, c] of counts) {
    if (c > bestCount) {
      best = g;
      bestCount = c;
    }
  }
  // Only treat as a real "step" if the dominant gap covers the majority.
  return bestCount / gaps.length >= 0.6 ? best : null;
}

/** Parse a cell into a finite number, or null. Accepts already-numeric values. */
export function toNumberOrNull(v: CellValue | undefined | null): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(s) ? n : null;
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
