// Rate Card Builder — CSV import / export.
//
// Pure module. CSV is the shipping format; an XLSX adapter can be added later
// behind the same `ImportParseResult` interface (see parseImport extension
// point). Export uses column labels as headers; import maps headers back to
// column codes (by code OR label, case-insensitive), normalizing values.

import { normalizeCell, normalizeCellBySemantic, splitLine, type Delimiter } from "./rateCardParse";
import type { RateCardColumn, RateCardRow } from "./rateCardTypes";

/**
 * Neutralize CSV/Excel formula injection: a cell whose text starts with
 * = + - @ (or tab/CR) can execute as a formula when opened in a spreadsheet.
 * Prefix such TEXT cells with a leading apostrophe. A cell that is a *pure*
 * number (digits + separators only, incl. a leading minus, e.g. "-5000") is
 * left intact so legitimate values are never altered.
 */
export function sanitizeCsvCell(value: string): string {
  if (value === "") return value;
  // A leading control char (tab/CR) is always neutralized; otherwise neutralize
  // = + - @ leads UNLESS the whole cell is a plain number (no whitespace, so a
  // "\t123" never counts as pure-number and gets prefixed).
  const isPureNumber = /^-?[\d.,]+$/.test(value);
  if (/^[=+\-@\t\r]/.test(value) && !isPureNumber) {
    return `'${value}`;
  }
  return value;
}

function csvEscape(value: string): string {
  const safe = sanitizeCsvCell(value);
  if (/[",\n\r]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

/** Serialize rows → CSV string with a header row of column labels. */
export function exportCsv(rows: RateCardRow[], columns: RateCardColumn[]): string {
  const ordered = [...columns].sort((a, b) => a.position - b.position);
  const header = ordered.map((c) => csvEscape(c.label)).join(",");
  const lines = rows.map((r) => ordered.map((c) => csvEscape(String(r[c.code] ?? ""))).join(","));
  return [header, ...lines].join("\r\n");
}

export interface ImportParseResult {
  rows: RateCardRow[];
  /** Column codes detected in the file, in file order. */
  columns: string[];
  notes: string[];
  /** True when the first line was consumed as a header. */
  hasHeader: boolean;
}

/**
 * Parse a CSV file into rows mapped onto the given columns.
 * - Header row is detected when the first line's cells match known column
 *   codes/labels (and aren't all numeric).
 * - Without a header, columns are mapped positionally.
 * - Values are normalized per the target column type.
 */
export function parseCsvImport(text: string, columns: RateCardColumn[]): ImportParseResult {
  const ordered = [...columns].sort((a, b) => a.position - b.position);
  const notes: string[] = [];
  const norm = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/^\uFEFF/, "");
  const body = norm.endsWith("\n") ? norm.slice(0, -1) : norm;
  const lines = body.split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) return { rows: [], columns: [], notes: ["File rỗng"], hasHeader: false };

  // Detect the file delimiter: tab, then semicolon (EU CSV), then comma.
  // Ignore separators that live inside quoted labels (e.g. "Giá (US; CA)").
  const head = lines[0].replace(/"[^"]*"/g, "");
  const delim: Delimiter = head.includes("\t") ? "\t" : head.includes(";") ? ";" : ",";
  if (delim !== ",") notes.push(`Phát hiện dấu phân tách: "${delim === "\t" ? "Tab" : delim}"`);
  const matrix = lines.map((l) => splitLine(l, delim).map((c) => c.trim()));

  // Header detection.
  const first = matrix[0];
  const byCode = new Map(ordered.map((c) => [c.code.toLowerCase(), c]));
  const byLabel = new Map(ordered.map((c) => [c.label.toLowerCase(), c]));
  const looksLikeHeader =
    first.some((cell) => byCode.has(cell.toLowerCase()) || byLabel.has(cell.toLowerCase())) &&
    !first.every((cell) => /^-?[\d.,\s]+$/.test(cell));

  let colOrder: RateCardColumn[];
  let dataRows: string[][];
  if (looksLikeHeader) {
    colOrder = first.map((cell) => {
      const c = byCode.get(cell.toLowerCase()) ?? byLabel.get(cell.toLowerCase());
      if (c) return c;
      notes.push(`Cột "${cell}" không khớp — bỏ qua`);
      return null as unknown as RateCardColumn;
    });
    dataRows = matrix.slice(1);
  } else {
    notes.push("Không có dòng tiêu đề — map theo thứ tự cột");
    colOrder = [...ordered];
    dataRows = matrix;
  }

  const expectedCols = colOrder.length;
  const rows: RateCardRow[] = dataRows.map((cells, ri) => {
    // Report (don't silently swallow) rows whose column count is off — a sign
    // of a wrong delimiter or a stray separator inside an unquoted value.
    if (cells.length !== expectedCols) {
      const lineNo = ri + 1 + (looksLikeHeader ? 1 : 0);
      notes.push(
        `Dòng ${lineNo}: có ${cells.length} cột (mong đợi ${expectedCols}) — đã map phần khớp`,
      );
    }
    const row: RateCardRow = {};
    for (const c of ordered) row[c.code] = ""; // ensure all columns present
    for (let i = 0; i < cells.length && i < colOrder.length; i++) {
      const col = colOrder[i];
      if (!col) continue; // unmatched header column
      // Semantic-aware (currency/rate) when available; legacy type otherwise.
      row[col.code] = col.semantic
        ? normalizeCellBySemantic(cells[i], col.semantic)
        : normalizeCell(cells[i], col.type);
    }
    return row;
  });

  return {
    rows,
    columns: colOrder.filter(Boolean).map((c) => c.code),
    notes,
    hasHeader: looksLikeHeader,
  };
}

/**
 * Parse an .xlsx/.xls ArrayBuffer into rows. Reads the FIRST worksheet, converts
 * it to CSV text, and reuses parseCsvImport (so header detection, column
 * mapping, and semantic-aware normalization are identical to CSV). `xlsx`
 * (SheetJS) is dynamically imported so it stays out of the main bundle.
 */
export async function parseXlsxImport(
  buffer: ArrayBuffer,
  columns: RateCardColumn[],
): Promise<ImportParseResult> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "array" });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) {
    return { rows: [], columns: [], notes: ["File Excel không có sheet nào"], hasHeader: false };
  }
  const sheet = wb.Sheets[firstSheetName];
  // FS=","; SheetJS quotes any cell containing the delimiter, so commas inside
  // values survive parseCsvImport's RFC-4180 splitter.
  const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ",", blankrows: false });
  const result = parseCsvImport(csv, columns);
  const note = `Đọc sheet đầu tiên: "${firstSheetName}"${wb.SheetNames.length > 1 ? ` (bỏ qua ${wb.SheetNames.length - 1} sheet khác)` : ""}`;
  return { ...result, notes: [note, ...result.notes] };
}
