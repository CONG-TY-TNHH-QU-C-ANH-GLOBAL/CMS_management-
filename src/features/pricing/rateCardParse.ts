// Rate Card Builder — clipboard / delimited parsing + number normalization.
//
// Pure module (no DOM, no React). Handles:
//  - Excel / Google Sheets clipboard (TSV, CSV, or whitespace-separated).
//  - Locale number normalization for VND ("1,387,634", "1.387.634",
//    "1387634 VNĐ", "₫1.589.754", weights like "0.5"/"1,5").
//  - Anchored paste: map a matrix from a focused cell down/right, auto-
//    expanding rows when the paste is taller than the grid.

import type { CellValue, ColumnType, RateCardColumn, RateCardRow } from "./rateCardTypes";

export interface PasteResult {
  rows: RateCardRow[];
  /** `${rowIndex}:${colCode}` of every cell whose value changed — for highlight. */
  changedCells: string[];
  rowsAdded: number;
  cellsUpdated: number;
  /** Distinct rows touched. */
  rowsAffected: number;
  /** Non-fatal notes shown to the operator (never silent). */
  notes: string[];
}

/**
 * Parse a locale-formatted number string into a JS number (may be decimal).
 * Returns null when there is no parseable number.
 *
 * Rules (VN-friendly):
 *  - Currency tokens / letters / spaces are stripped first.
 *  - If both "," and "." appear, the LAST one is the decimal separator and the
 *    other is the thousands separator.
 *  - A single separator with >1 occurrence is a thousands separator.
 *  - A single separator with exactly 3 trailing digits is treated as thousands
 *    ("1.387" → 1387, "1,234" → 1234) — the price convention.
 *  - A single separator with 1–2 (or 4+) trailing digits is a decimal
 *    ("0.5" → 0.5, "1,5" → 1.5, "12.34" → 12.34).
 *  - `preferDecimal` (used for weight columns) forces a single separator to be
 *    a decimal regardless of trailing-digit count, so "1.500" kg → 1.5 not 1500.
 */
export function parseLocaleNumber(
  raw: CellValue | null | undefined,
  preferDecimal = false,
): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;

  // Keep only digits, separators and sign.
  let s = raw.replace(/[^\d.,-]/g, "").trim();
  if (s === "" || s === "-" || !/\d/.test(s)) return null;

  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  let normalized: string;

  if (hasComma && hasDot) {
    const decimalSep = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
    const thousandSep = decimalSep === "," ? "." : ",";
    normalized = s.split(thousandSep).join("").replace(decimalSep, ".");
  } else if (hasComma || hasDot) {
    const sep = hasComma ? "," : ".";
    const count = s.split(sep).length - 1;
    const lastGroup = s.slice(s.lastIndexOf(sep) + 1);
    if (!preferDecimal && (count > 1 || lastGroup.length === 3)) {
      // thousands
      normalized = s.split(sep).join("");
    } else if (count > 1) {
      // multiple separators can never be a single decimal → thousands
      normalized = s.split(sep).join("");
    } else {
      // decimal
      normalized = s.replace(sep, ".");
    }
  } else {
    normalized = s;
  }

  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** Normalize a raw value into an integer VND amount, or null. */
export function normalizeCurrency(raw: CellValue | null | undefined): number | null {
  const n = parseLocaleNumber(raw);
  if (n === null) return null;
  return Math.round(n);
}

/**
 * Normalize a single cell for a column type. Numeric-looking input becomes a
 * number; anything else (e.g. "Liên hệ", "21-30") is kept as a trimmed string
 * so existing non-numeric rows survive. Empty stays "".
 */
export function normalizeCell(raw: CellValue, type: ColumnType): CellValue {
  const str = typeof raw === "string" ? raw.trim() : raw;
  if (str === "") return "";
  if (type === "currency") {
    const n = normalizeCurrency(str);
    return n === null ? String(str).trim() : n;
  }
  if (type === "number") {
    // Weight columns: a single separator is a decimal ("1.5" kg), never thousands.
    const n = parseLocaleNumber(str, true);
    return n === null ? String(str).trim() : n;
  }
  return String(str).trim();
}

export type Delimiter = "\t" | "," | ";" | "ws";

/** Pick the delimiter for clipboard text. Tab wins, then ; , else whitespace. */
export function detectDelimiter(text: string): Delimiter {
  if (text.includes("\t")) return "\t";
  const firstLine = (text.split(/\r\n|\n|\r/)[0] ?? "").trim();
  // Semicolon is unambiguous (it's never a number separator) — prefer it.
  if (/;/.test(firstLine)) return ";";
  if (/,/.test(firstLine)) {
    // With whitespace AND a comma, it's real CSV/columns.
    if (/\s/.test(firstLine)) return ",";
    // Commas but no whitespace: if the whole line is a single numeric token
    // (grouped like "1,387,634" or decimal like "12,5"), it's one cell — split
    // on whitespace so we don't shred a number. Otherwise it's CSV.
    if (/^-?[\d.,]+$/.test(firstLine)) return "ws";
    return ",";
  }
  return "ws";
}

/** Split one delimited line into raw cells (quote-aware for char delimiters). */
export function splitLine(line: string, delimiter: Delimiter): string[] {
  if (delimiter === "ws") return line.trim().split(/\s+/);
  if (delimiter === "\t") return line.split("\t");
  // CSV/SSV with minimal RFC-4180 quote handling.
  const sep = delimiter; // "," or ";"
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Parse clipboard/delimited text into a trimmed string matrix. */
export function parseClipboardMatrix(text: string, delimiter?: Delimiter): string[][] {
  const norm = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Drop a single trailing newline (Excel appends one) but keep interior blanks.
  const body = norm.endsWith("\n") ? norm.slice(0, -1) : norm;
  if (body === "") return [];
  const delim = delimiter ?? detectDelimiter(body);
  return (
    body
      .split("\n")
      .map((line) => splitLine(line, delim).map((c) => c.trim()))
      // Drop fully-empty lines (all cells blank).
      .filter((cells) => cells.some((c) => c !== ""))
  );
}

function blankRow(columns: RateCardColumn[]): RateCardRow {
  const r: RateCardRow = {};
  for (const c of columns) r[c.code] = "";
  return r;
}

/**
 * Apply a pasted matrix anchored at (startRow, startCol), mapping down/right.
 * Auto-expands `rows` when the paste is taller than the grid. Extra pasted
 * columns beyond the grid are dropped with a note. Returns new rows + summary.
 */
export function applyPaste(
  rows: RateCardRow[],
  columns: RateCardColumn[],
  startRow: number,
  startCol: number,
  matrix: string[][],
  options: { onAddRow?: () => RateCardRow } = {},
): PasteResult {
  const notes: string[] = [];
  const changedCells: string[] = [];
  const next = rows.map((r) => ({ ...r }));
  const affectedRows = new Set<number>();
  let cellsUpdated = 0;
  let rowsAdded = 0;

  if (matrix.length === 0) {
    return {
      rows: next,
      changedCells,
      rowsAdded: 0,
      cellsUpdated: 0,
      rowsAffected: 0,
      notes: ["Clipboard rỗng — không có gì để dán"],
    };
  }

  const maxCols = matrix.reduce((m, row) => Math.max(m, row.length), 0);
  const availableCols = columns.length - startCol;
  if (maxCols > availableCols) {
    notes.push(`Bỏ qua ${maxCols - availableCols} cột thừa (vượt quá số cột của bảng)`);
  }

  for (let i = 0; i < matrix.length; i++) {
    const targetRow = startRow + i;
    if (targetRow >= next.length) {
      next.push(options.onAddRow ? options.onAddRow() : blankRow(columns));
      rowsAdded++;
    }
    const rowCells = matrix[i];
    for (let j = 0; j < rowCells.length; j++) {
      const colIndex = startCol + j;
      if (colIndex >= columns.length) break; // extra columns dropped (noted above)
      const col = columns[colIndex];
      const value = normalizeCell(rowCells[j], col.type);
      if (next[targetRow][col.code] !== value) {
        next[targetRow][col.code] = value;
        changedCells.push(`${targetRow}:${col.code}`);
        cellsUpdated++;
        affectedRows.add(targetRow);
      }
    }
  }

  return {
    rows: next,
    changedCells,
    rowsAdded,
    cellsUpdated,
    rowsAffected: affectedRows.size,
    notes,
  };
}
