// Rate Card Builder — validation engine.
//
// Pure module. Produces critical errors (block publish) and warnings (allowed
// but shown loudly). Severity policy is deliberate: cells legitimately hold
// non-numeric strings ("Liên hệ" prices, "21-30" weight brackets) on the live
// landing site, so those are WARNINGS — never hard blocks — to avoid breaking
// existing tables.

import { toNumberOrNull, type GridConfig } from "./rateCardTypes";
import type { RateCardRow, ValidationIssue, ValidationResult } from "./rateCardTypes";
import { DEFAULT_PRICE_JUMP_THRESHOLD_PCT } from "./rateCardTypes";

export interface ValidateOptions {
  priceJumpThresholdPct?: number;
  checkMonotonic?: boolean;
  checkMissingStep?: boolean;
  /** When set (e.g. after a full replace), warn if row count diverged. */
  expectedRowCount?: number | null;
  /**
   * Column codes that are strictly numeric for THIS table (inferred from the
   * published data: a column whose every existing value is numeric). A
   * non-numeric value in a strict column is a CRITICAL error (blocks publish) —
   * it catches a typo'd text entry into a numeric grid. Columns that already
   * hold legitimate text ("Liên hệ", "21-30") are absent here, so non-numeric
   * stays a warning for them.
   */
  strictNumericCols?: ReadonlySet<string>;
}

/** Canonical key used for duplicate detection (numeric 1 === "1"). */
function weightKey(raw: unknown): string {
  const n = toNumberOrNull(raw as never);
  if (n !== null) return `n:${n}`;
  return `s:${String(raw ?? "")
    .trim()
    .toLowerCase()}`;
}

export function validateRateCard(
  rows: RateCardRow[],
  config: GridConfig,
  options: ValidateOptions = {},
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const threshold = options.priceJumpThresholdPct ?? DEFAULT_PRICE_JUMP_THRESHOLD_PCT;
  const checkMonotonic = options.checkMonotonic ?? true;
  const checkMissingStep = options.checkMissingStep ?? true;
  const strict = options.strictNumericCols;
  const { weightCol, priceCols, step } = config;

  const push = (i: Omit<ValidationIssue, never>) => issues.push(i);

  // --- Per-cell + per-row checks ---
  const seen = new Map<string, number>(); // weightKey → first row index
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const wRaw = row[weightCol];
    const wEmpty = wRaw === "" || wRaw === null || wRaw === undefined;

    if (wEmpty) {
      push({
        severity: "critical",
        code: "weight_empty",
        message: `Dòng ${r + 1}: cân nặng trống`,
        rowIndex: r,
        column: weightCol,
      });
    } else {
      const wn = toNumberOrNull(wRaw);
      if (wn === null) {
        const isStrict = strict?.has(weightCol) ?? false;
        push({
          severity: isStrict ? "critical" : "warning",
          code: "weight_non_numeric",
          message: isStrict
            ? `Dòng ${r + 1}: cân nặng "${String(wRaw)}" không phải số (bảng này yêu cầu số)`
            : `Dòng ${r + 1}: cân nặng "${String(wRaw)}" không phải số (cho phép nếu là khoảng/bracket)`,
          rowIndex: r,
          column: weightCol,
        });
      } else if (wn <= 0) {
        push({
          severity: "critical",
          code: "weight_not_positive",
          message: `Dòng ${r + 1}: cân nặng phải > 0`,
          rowIndex: r,
          column: weightCol,
        });
      }
      // Duplicate detection (only for non-empty weights).
      const key = weightKey(wRaw);
      if (seen.has(key)) {
        push({
          severity: "critical",
          code: "duplicate_weight",
          message: `Dòng ${r + 1}: trùng cân nặng với dòng ${seen.get(key)! + 1}`,
          rowIndex: r,
          column: weightCol,
        });
      } else {
        seen.set(key, r);
      }
    }

    for (const pc of priceCols) {
      const pRaw = row[pc];
      const pEmpty = pRaw === "" || pRaw === null || pRaw === undefined;
      if (pEmpty) {
        push({
          severity: "critical",
          code: "price_empty",
          message: `Dòng ${r + 1}: giá (${pc}) trống`,
          rowIndex: r,
          column: pc,
        });
        continue;
      }
      const pn = toNumberOrNull(pRaw);
      if (pn === null) {
        const isStrict = strict?.has(pc) ?? false;
        push({
          severity: isStrict ? "critical" : "warning",
          code: "price_non_numeric",
          message: isStrict
            ? `Dòng ${r + 1}: giá (${pc}) "${String(pRaw)}" không phải số (bảng này yêu cầu số)`
            : `Dòng ${r + 1}: giá (${pc}) "${String(pRaw)}" không phải số (cho phép nếu là "Liên hệ")`,
          rowIndex: r,
          column: pc,
        });
      } else if (pn < 0) {
        push({
          severity: "critical",
          code: "price_negative",
          message: `Dòng ${r + 1}: giá (${pc}) âm`,
          rowIndex: r,
          column: pc,
        });
      } else if (!Number.isInteger(pn)) {
        push({
          severity: "critical",
          code: "price_not_integer",
          message: `Dòng ${r + 1}: giá (${pc}) phải là số nguyên (VND)`,
          rowIndex: r,
          column: pc,
        });
      }
    }
  }

  // --- Sequence checks over numeric weights (row order) ---
  const numericWeights: { r: number; w: number }[] = [];
  for (let r = 0; r < rows.length; r++) {
    const wn = toNumberOrNull(rows[r][weightCol]);
    if (wn !== null) numericWeights.push({ r, w: wn });
  }

  if (checkMonotonic) {
    for (let i = 1; i < numericWeights.length; i++) {
      if (numericWeights[i].w <= numericWeights[i - 1].w) {
        push({
          severity: "warning",
          code: "weight_not_increasing",
          message: `Dòng ${numericWeights[i].r + 1}: cân nặng không tăng dần (${numericWeights[i].w} ≤ ${numericWeights[i - 1].w})`,
          rowIndex: numericWeights[i].r,
          column: weightCol,
        });
      }
    }
  }

  if (checkMissingStep && step && step > 0) {
    for (let i = 1; i < numericWeights.length; i++) {
      const gap = round6(numericWeights[i].w - numericWeights[i - 1].w);
      if (
        gap > 0 &&
        Math.abs(gap - step) > 1e-6 &&
        round6(gap / step) === Math.round(gap / step) &&
        gap > step
      ) {
        push({
          severity: "warning",
          code: "missing_weight_step",
          message: `Dòng ${numericWeights[i].r + 1}: thiếu mốc cân nặng (nhảy ${gap}kg, bước chuẩn ${step}kg)`,
          rowIndex: numericWeights[i].r,
          column: weightCol,
        });
      }
    }
  }

  // --- Abnormal price jumps per price column (row order, numeric only) ---
  for (const pc of priceCols) {
    let prev: { r: number; v: number } | null = null;
    for (let r = 0; r < rows.length; r++) {
      const v = toNumberOrNull(rows[r][pc]);
      if (v === null) continue;
      if (prev && prev.v !== 0) {
        const pct = ((v - prev.v) / prev.v) * 100;
        if (Math.abs(pct) > threshold) {
          push({
            severity: "warning",
            code: "abnormal_price_jump",
            message: `Dòng ${r + 1}: giá (${pc}) đổi ${pct > 0 ? "+" : ""}${round2(pct)}% so với dòng trước (ngưỡng ${threshold}%)`,
            rowIndex: r,
            column: pc,
          });
        }
      }
      prev = { r, v };
    }
  }

  // --- Optional row-count mismatch (full replace context) ---
  if (options.expectedRowCount != null && options.expectedRowCount !== rows.length) {
    push({
      severity: "warning",
      code: "row_count_mismatch",
      message: `Số dòng thay đổi: ${options.expectedRowCount} → ${rows.length}`,
    });
  }

  return buildResult(issues);
}

function buildResult(issues: ValidationIssue[]): ValidationResult {
  const cellIssues = new Map<string, ValidationIssue[]>();
  const rowIssues = new Map<number, ValidationIssue[]>();
  let criticalCount = 0;
  let warningCount = 0;
  for (const issue of issues) {
    if (issue.severity === "critical") criticalCount++;
    else warningCount++;
    if (issue.rowIndex !== undefined) {
      const rl = rowIssues.get(issue.rowIndex) ?? [];
      rl.push(issue);
      rowIssues.set(issue.rowIndex, rl);
      if (issue.column) {
        const k = `${issue.rowIndex}:${issue.column}`;
        const cl = cellIssues.get(k) ?? [];
        cl.push(issue);
        cellIssues.set(k, cl);
      }
    }
  }
  return { issues, criticalCount, warningCount, cellIssues, rowIssues };
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
