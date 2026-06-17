// Rate Card Builder — the spreadsheet grid.
//
// Wraps react-data-grid with: anchored multi-cell paste (Excel/Sheets TSV/CSV),
// changed-cell highlight, inline validation markers, VND display formatting
// (raw on edit), and inline-edit normalization. All parsing/normalization is
// delegated to the pure rateCard* modules.

import { useCallback, useMemo, useRef } from "react";
import { DataGrid, SelectColumn, type Column, type RenderEditCellProps } from "react-data-grid";
import "react-data-grid/lib/styles.css";

import { applyPaste, normalizeCellBySemantic, parseClipboardMatrix } from "../rateCardParse";
import {
  formatCellBySemantic,
  isNumericSemantic,
  type GridConfig,
  type RateCardColumn,
  type SemanticType,
  type ValidationResult,
} from "../rateCardTypes";
import type { GridRow, OpResult } from "../useRateCardEditor";

interface Props {
  rows: GridRow[];
  cols: RateCardColumn[];
  config: GridConfig;
  validation: ValidationResult;
  /** `${rowIndex}:${colCode}` keys that just changed (for highlight). */
  changedCells: Set<string>;
  onGridRowsChange: (rows: GridRow[], changedKeys?: string[]) => void;
  onApplyOp: (result: OpResult, label: string) => void;
  selectedRowIds: Set<string>;
  onSelectedRowIdsChange: (ids: Set<string>) => void;
  height?: number;
  /** When true, cells are not editable and paste is disabled (viewer mode). */
  readOnly?: boolean;
}

function TextEditor({ row, column, onRowChange, onClose }: RenderEditCellProps<GridRow>) {
  return (
    <input
      autoFocus
      defaultValue={String(row[column.key] ?? "")}
      className="w-full h-full px-2 outline-none border-2 border-primary bg-background text-right tabular-nums"
      onBlur={(e) => {
        onRowChange({ ...row, [column.key]: e.target.value }, true);
        onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          onRowChange({ ...row, [column.key]: (e.target as HTMLInputElement).value }, true);
          onClose();
        }
        if (e.key === "Escape") onClose();
      }}
    />
  );
}

export function RateCardGrid({
  rows,
  cols,
  config,
  validation,
  changedCells,
  onGridRowsChange,
  onApplyOp,
  selectedRowIds,
  onSelectedRowIdsChange,
  height = 540,
  readOnly = false,
}: Props) {
  // Track the focused cell so paste knows where to anchor. colKey is resolved
  // to a data-column index at paste time (the SelectColumn shifts column.idx).
  const selected = useRef<{ rowIdx: number; colKey: string }>({ rowIdx: 0, colKey: "" });

  // Translate index-keyed change/issue sets to id-keyed for cellClass lookup.
  const changedIdKeys = useMemo(() => {
    const s = new Set<string>();
    for (const key of changedCells) {
      const [idxStr, col] = key.split(":");
      const idx = Number(idxStr);
      const r = rows[idx];
      if (r) s.add(`${r.__id}:${col}`);
    }
    return s;
  }, [changedCells, rows]);

  const cellIssueIdKeys = useMemo(() => {
    const map = new Map<string, "critical" | "warning">();
    for (const [key, issues] of validation.cellIssues) {
      const [idxStr, col] = key.split(":");
      const r = rows[Number(idxStr)];
      if (!r) continue;
      const severity = issues.some((i) => i.severity === "critical") ? "critical" : "warning";
      map.set(`${r.__id}:${col}`, severity);
    }
    return map;
  }, [validation.cellIssues, rows]);

  const gridColumns = useMemo<Column<GridRow>[]>(() => {
    const dataCols = cols.map((c, i) => {
      const semantic: SemanticType = c.semantic ?? "unknown";
      const numeric = isNumericSemantic(semantic);
      return {
        key: c.code,
        name: c.label,
        width: i === 0 ? 110 : 130,
        frozen: i === 0,
        resizable: true,
        editable: !readOnly,
        renderEditCell: TextEditor,
        cellClass: (row: GridRow) => {
          const idKey = `${row.__id}:${c.code}`;
          const classes = ["tabular-nums"];
          if (numeric) classes.push("text-right");
          const sev = cellIssueIdKeys.get(idKey);
          if (sev === "critical")
            classes.push("!bg-red-50 !text-red-700 ring-1 ring-inset ring-red-300");
          else if (sev === "warning") classes.push("!bg-amber-50 !text-amber-800");
          if (changedIdKeys.has(idKey)) classes.push("rc-changed");
          return classes.join(" ");
        },
        renderCell: ({ row }) => formatCellBySemantic(row[c.code], semantic),
      } satisfies Column<GridRow>;
    });
    return readOnly ? dataCols : [SelectColumn, ...dataCols];
  }, [cols, changedIdKeys, cellIssueIdKeys, readOnly]);

  const handleRowsChange = useCallback(
    (next: GridRow[], data: { indexes: number[]; column: { key: string } }) => {
      // Normalize the edited cell(s) per column SEMANTIC: VND→integer,
      // USD/rate/number→decimal-preserving (so "4,03" → 4.03, never 403).
      const col = cols.find((c) => c.code === data.column.key);
      const changedKeys: string[] = [];
      if (col) {
        const semantic: SemanticType = col.semantic ?? "unknown";
        for (const idx of data.indexes) {
          const raw = next[idx][col.code];
          next[idx] = { ...next[idx], [col.code]: normalizeCellBySemantic(raw as never, semantic) };
          changedKeys.push(`${idx}:${col.code}`);
        }
      }
      onGridRowsChange(next, changedKeys);
    },
    [cols, onGridRowsChange],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      if (readOnly) return;
      const text = e.clipboardData.getData("text/plain");
      if (!text) return;
      e.preventDefault();
      const matrix = parseClipboardMatrix(text);
      const { rowIdx, colKey } = selected.current;
      const plain = rows.map(({ __id, ...rest }) => {
        void __id;
        return rest;
      });
      // Clamp the anchor to the current grid (rows may have shrunk since the
      // last cell focus) so a stale row index never injects blank filler rows.
      const startRow = Math.min(Math.max(0, rowIdx), Math.max(0, plain.length - 1));
      const colIdx = Math.max(
        0,
        cols.findIndex((c) => c.code === colKey),
      );
      const result = applyPaste(plain, cols, startRow, colIdx, matrix);
      onApplyOp(
        { rows: result.rows, changedCells: result.changedCells },
        `Dán ${matrix.length} dòng · ${result.cellsUpdated} ô${result.notes.length ? ` · ${result.notes.join("; ")}` : ""}`,
      );
    },
    [rows, cols, onApplyOp, readOnly],
  );

  return (
    <div
      className="rounded-lg border border-border overflow-hidden bg-background rc-grid"
      style={{ height }}
      onPasteCapture={handlePaste}
    >
      <DataGrid
        columns={gridColumns}
        rows={rows}
        rowKeyGetter={(r) => r.__id}
        onRowsChange={handleRowsChange}
        onSelectedCellChange={(args) => {
          selected.current = { rowIdx: args.rowIdx, colKey: args.column.key };
        }}
        selectedRows={selectedRowIds}
        onSelectedRowsChange={onSelectedRowIdsChange}
        rowClass={(r) => (selectedRowIds.has(r.__id) ? "rc-row-selected" : undefined)}
        rowHeight={32}
        headerRowHeight={36}
        className="rdg-light"
      />
    </div>
  );
}
