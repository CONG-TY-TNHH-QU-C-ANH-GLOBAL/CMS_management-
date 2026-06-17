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

/**
 * Semantic type drives parse/validate/format. Critical: NOT every numeric
 * column is integer VND. `money_vnd` is integer; `money_usd`/`rate_decimal`/
 * `number_decimal`/`weight` are decimal; `text` is free-form (e.g. "Liên hệ",
 * "20%"). Inferred from schema metadata first, then column label/code + data.
 */
export type SemanticType =
  | "weight"
  | "money_vnd"
  | "money_usd"
  | "rate_decimal"
  | "number_decimal"
  | "text"
  | "unknown";

export interface RateCardColumn {
  code: string;
  label: string;
  position: number;
  /** Legacy storage type ("number"|"currency"|"text"). Kept for back-compat;
   *  `semantic` is the source of truth for parse/validate/format. */
  type: ColumnType;
  /** Optional explicit semantic (persisted additively on publish). */
  semantic?: SemanticType;
  /** Optional explicit currency ("VND" | "USD"). Column-level overrides table. */
  currency?: string;
  /** Optional unit hint (e.g. "kg"). */
  unit?: string;
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
  /** Codes of NUMERIC value columns (money/rate/number) — excludes weight + text. */
  priceCols: string[];
  /** Columns annotated with their resolved `semantic`. */
  columns: RateCardColumn[];
  /** code → resolved semantic, for every column. */
  semanticByCol: Record<string, SemanticType>;
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

// Label/code heuristics for semantic inference. Order matters: weight, then
// USD ($) before VND, then rate.
const WEIGHT_RE = /\bkg\b|weight|gram|cân\s*nặng|trọng\s*lượng/i;
const MONEY_USD_RE = /\busd\b|us\$|\$/i;
// No \b around "giá": ASCII word boundaries don't fire after the accented "á",
// so \bgiá\b would never match the real label "Giá (VNĐ)".
const MONEY_VND_RE = /\bvnd\b|vnđ|₫|giá/i;
const RATE_RE = /\brate\b|tỷ\s*giá|tỉ\s*giá/i;

/** Heuristic: is a column code the weight/key column? */
export function isWeightCode(code: string): boolean {
  return WEIGHT_CODE_HINTS.has(code.toLowerCase());
}

/** Numeric semantics get numeric parse + validation; text/unknown do not. */
export function isNumericSemantic(s: SemanticType): boolean {
  return (
    s === "weight" ||
    s === "money_vnd" ||
    s === "money_usd" ||
    s === "rate_decimal" ||
    s === "number_decimal"
  );
}

/** Money/rate semantics that must NOT round to integer (decimal-preserving). */
export function isDecimalSemantic(s: SemanticType): boolean {
  return s === "money_usd" || s === "rate_decimal" || s === "number_decimal" || s === "weight";
}

/**
 * Resolve a column's semantic type. Priority:
 *  1. explicit `column.semantic`
 *  2. explicit `column.currency` (USD/VND)
 *  3. label/code keyword (weight → USD/$ → VND → rate)
 *  4. data shape (any non-numeric text → text; all-numeric → number_decimal)
 *  5. legacy `type` ("text" → text) else "unknown"
 * Never forces integer VND on a column that isn't clearly VND.
 */
export function inferSemanticType(
  column: RateCardColumn,
  values: CellValue[],
  tableCurrency?: string,
): SemanticType {
  if (column.semantic) return column.semantic;

  const cur = (column.currency ?? "").toUpperCase();
  if (cur === "USD") return "money_usd";
  if (cur === "VND") return "money_vnd";

  const hay = `${column.code} ${column.label}`;
  if (WEIGHT_RE.test(hay) || isWeightCode(column.code)) return "weight";
  if (MONEY_USD_RE.test(hay)) return "money_usd";
  // RATE before VND: "RATE"/"tỷ giá" are rates; generic "giá" → VND.
  if (RATE_RE.test(hay)) return "rate_decimal";
  if (MONEY_VND_RE.test(hay)) return "money_vnd";

  // Data-driven: any legit non-numeric text → treat as text (lenient).
  let sawValue = false;
  let sawNonNumeric = false;
  for (const v of values) {
    if (v === "" || v === null || v === undefined) continue;
    sawValue = true;
    if (toNumberOrNull(v) === null) {
      sawNonNumeric = true;
      break;
    }
  }
  if (sawNonNumeric) return "text";
  if (sawValue) {
    // All-numeric column with no currency hint: decimal-permissive number.
    // Only call it VND if the table currency explicitly says so AND values
    // look like integers (avoids forcing integer on rate/decimal columns).
    if ((tableCurrency ?? "").toUpperCase() === "VND") {
      const allInt = values.every((v) => {
        const n = toNumberOrNull(v);
        return n === null || Number.isInteger(n);
      });
      if (allInt) return "money_vnd";
    }
    return "number_decimal";
  }

  if (column.type === "text") return "text";
  if (column.type === "number") return "weight";
  return "unknown";
}

/** Annotate columns with resolved semantic (preserving existing explicit ones). */
export function annotateSemantics(
  columns: RateCardColumn[],
  rows: RateCardRow[],
  tableCurrency?: string,
): RateCardColumn[] {
  return columns.map((c) => ({
    ...c,
    semantic: inferSemanticType(
      c,
      rows.map((r) => r[c.code]).filter((v) => v !== undefined),
      tableCurrency,
    ),
  }));
}

/** Format a cell for DISPLAY only (never mutates stored data). */
export function formatCellBySemantic(
  value: CellValue | undefined | null,
  semantic: SemanticType,
): string {
  if (value === "" || value === null || value === undefined) return "";
  const n = toNumberOrNull(value);
  // Non-numeric value in any column → show raw (e.g. "Liên hệ", "20%").
  if (n === null) return String(value);
  switch (semantic) {
    case "money_vnd":
      return n.toLocaleString("vi-VN", { maximumFractionDigits: 0 });
    case "money_usd":
      return `$${n.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
    case "rate_decimal":
    case "number_decimal":
      return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
    case "weight":
    case "text":
    case "unknown":
    default:
      return String(value);
  }
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
  const tableCurrency = schema?.currency ?? DEFAULT_CURRENCY;
  const annotated = annotateSemantics(
    [...columns].sort((a, b) => a.position - b.position),
    rows,
    tableCurrency,
  );

  const semanticByCol: Record<string, SemanticType> = {};
  for (const c of annotated) semanticByCol[c.code] = c.semantic ?? "unknown";

  // Weight = first column resolved as weight, else first weight-coded, else col 0.
  const weightCol =
    annotated.find((c) => c.semantic === "weight")?.code ??
    annotated.find((c) => isWeightCode(c.code))?.code ??
    annotated[0]?.code ??
    "kg";

  // Price columns = numeric semantics, excluding the weight column. Text columns
  // are NOT price columns (they get lenient validation, e.g. "20%" / "Liên hệ").
  const priceCols = annotated
    .filter((c) => c.code !== weightCol && isNumericSemantic(c.semantic ?? "unknown"))
    .map((c) => c.code);

  const step =
    typeof schema?.step === "number" && schema.step > 0 ? schema.step : inferStep(rows, weightCol);

  return {
    weightCol,
    priceCols,
    columns: annotated,
    semanticByCol,
    step,
    currency: tableCurrency,
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
