import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Save, Trash2, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { DataGrid, type Column, type RenderEditCellProps } from "react-data-grid";
import { toast } from "sonner";
import "react-data-grid/lib/styles.css";

import { savePricingTableFn, type PricingTableRow } from "@/features/pricing/pricing.actions";

interface Props {
  table: PricingTableRow & { schema: unknown; data: unknown };
  /** UI gate (backend enforces requireSession("editor") independently). */
  canEdit?: boolean;
}

interface GridRow {
  __id: string; // stable React key
  [key: string]: unknown;
}

interface ColumnDef {
  code: string;
  label: string;
  position: number;
  type?: string;
}

function genId(): string {
  return Math.random().toString(36).slice(2, 11);
}

/** Normalize raw data_json into editable grid rows + column list. */
function normalizeWeightGrid(
  data: unknown,
  schemaCols: ColumnDef[],
): { rows: GridRow[]; cols: ColumnDef[] } {
  if (!Array.isArray(data)) return { rows: [], cols: schemaCols };
  // Compute union of keys across all rows
  const keySet = new Set<string>();
  for (const r of data as Record<string, unknown>[]) {
    if (r && typeof r === "object") for (const k of Object.keys(r)) keySet.add(k);
  }
  for (const c of schemaCols) keySet.add(c.code);
  // Order: schema cols first (preserve schema order), then any extras
  const orderedCodes: string[] = [];
  for (const c of schemaCols) {
    if (keySet.has(c.code)) {
      orderedCodes.push(c.code);
      keySet.delete(c.code);
    }
  }
  for (const k of Array.from(keySet)) orderedCodes.push(k);

  const cols: ColumnDef[] = orderedCodes.map((code, i) => {
    const found = schemaCols.find((c) => c.code === code);
    return (
      found ?? {
        code,
        label: code === "kg" ? "Kg" : code.toUpperCase(),
        position: i,
        type: code === "kg" ? "number" : "currency",
      }
    );
  });

  const rows: GridRow[] = (data as Record<string, unknown>[]).map((r) => {
    const row: GridRow = { __id: genId() };
    for (const code of orderedCodes) row[code] = r?.[code] ?? "";
    return row;
  });
  return { rows, cols };
}

function isNumericColumn(code: string, cols: ColumnDef[]): boolean {
  if (code === "kg" || code === "weight" || code === "gram") return true;
  const col = cols.find((c) => c.code === code);
  if (!col) return false;
  return col.type === "currency" || col.type === "number";
}

function coerceNumericIfPossible(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const s = v.trim();
  if (s === "") return v;
  // Allow Vietnamese-formatted numbers like "153.338" or "1,234.56"; strip thousand seps.
  const cleaned = s.replace(/\s/g, "").replace(/,/g, "");
  const n = Number(cleaned);
  if (Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(cleaned)) return n;
  return v;
}

function denormalizeWeightGrid(rows: GridRow[], cols: ColumnDef[]): unknown[] {
  return rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      if (k === "__id") continue;
      if (v === "" || v === null || v === undefined) continue;
      out[k] = isNumericColumn(k, cols) ? coerceNumericIfPossible(v) : v;
    }
    return out;
  });
}

function normalizeMetaKv(data: unknown): GridRow[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  return Object.entries(data as Record<string, unknown>).map(([key, value]) => ({
    __id: genId(),
    key,
    value: String(value ?? ""),
  }));
}

function denormalizeMetaKv(rows: GridRow[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    const k = String(r.key ?? "").trim();
    if (!k) continue;
    out[k] = r.value;
  }
  return out;
}

/** Editable text input for cells. Coerces number columns on commit. */
function TextEditor({ row, column, onRowChange, onClose }: RenderEditCellProps<GridRow>) {
  return (
    <input
      autoFocus
      defaultValue={String(row[column.key] ?? "")}
      className="w-full h-full px-2 outline-none border-2 border-primary bg-background"
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

export function PricingSpreadsheetEditor({ table, canEdit = true }: Props) {
  const router = useRouter();
  const save = useServerFn(savePricingTableFn);
  const isMetaKv = table.kind === "meta_kv";
  const schemaCols = useMemo<ColumnDef[]>(() => {
    const s = table.schema as { columns?: ColumnDef[] } | null;
    return s?.columns ?? [];
  }, [table.schema]);

  const initial = useMemo(() => {
    if (isMetaKv) return normalizeMetaKv(table.data);
    return normalizeWeightGrid(table.data, schemaCols).rows;
  }, [table.data, isMetaKv, schemaCols]);

  const initialCols = useMemo<ColumnDef[]>(() => {
    if (isMetaKv) return [];
    return normalizeWeightGrid(table.data, schemaCols).cols;
  }, [table.data, isMetaKv, schemaCols]);

  const [rows, setRows] = useState<GridRow[]>(initial);
  const [cols, setCols] = useState<ColumnDef[]>(initialCols);
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState(false);

  const isDirty = useMemo(() => {
    return (
      JSON.stringify(rows.map(({ __id, ...r }) => r)) !==
      JSON.stringify(initial.map(({ __id, ...r }) => r))
    );
  }, [rows, initial]);

  // Column defs for DataGrid
  const gridColumns = useMemo<Column<GridRow>[]>(() => {
    if (isMetaKv) {
      return [
        {
          key: "key",
          name: "Key (mã)",
          width: 140,
          editable: canEdit,
          renderEditCell: TextEditor,
        },
        {
          key: "value",
          name: "Value (mô tả)",
          editable: canEdit,
          renderEditCell: TextEditor,
        },
      ];
    }
    return cols.map((c, i) => ({
      key: c.code,
      name: c.label,
      width: i === 0 ? 80 : 100,
      frozen: i === 0,
      editable: canEdit,
      renderEditCell: TextEditor,
    }));
  }, [isMetaKv, cols, canEdit]);

  function addRow() {
    if (isMetaKv) {
      setRows((r) => [...r, { __id: genId(), key: "", value: "" }]);
    } else {
      const empty: GridRow = { __id: genId() };
      for (const c of cols) empty[c.code] = "";
      setRows((r) => [...r, empty]);
    }
  }

  function removeRow() {
    if (!selectedRow) {
      toast.warning("Click chọn 1 row trước khi xóa");
      return;
    }
    setRows((r) => r.filter((row) => row.__id !== selectedRow));
    setSelectedRow(null);
  }

  function addColumn() {
    if (isMetaKv) return;
    const code = window.prompt("Mã cột mới (vd: jp, kr, sg):")?.trim();
    if (!code) return;
    if (cols.some((c) => c.code === code)) {
      toast.error(`Cột "${code}" đã tồn tại`);
      return;
    }
    setCols((c) => [
      ...c,
      { code, label: code.toUpperCase(), position: c.length, type: "currency" },
    ]);
    setRows((rs) => rs.map((r) => ({ ...r, [code]: "" })));
  }

  function removeColumn(code: string) {
    if (code === "kg") {
      toast.error("Không thể xóa cột Kg");
      return;
    }
    if (!confirm(`Xóa cột "${code}"? Dữ liệu cột này sẽ mất.`)) return;
    setCols((c) => c.filter((col) => col.code !== code));
    setRows((rs) =>
      rs.map((r) => {
        const { [code]: _removed, ...rest } = r;
        return rest as GridRow;
      }),
    );
  }

  function discard() {
    if (!confirm("Bỏ tất cả thay đổi chưa lưu?")) return;
    setRows(initial);
    setCols(initialCols);
  }

  async function handleSave() {
    setPending(true);
    try {
      const data = isMetaKv ? denormalizeMetaKv(rows) : denormalizeWeightGrid(rows, cols);
      const data_json = JSON.stringify(data);
      const schema_json = JSON.stringify({
        type: table.kind,
        columns: isMetaKv ? undefined : cols,
      });
      const result = await save({
        data: { slug: table.slug, data_json, schema_json, comment: comment.trim() || null },
      });
      toast.success(`Đã lưu — version ${result.newVersion}`);
      setComment("");
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setPending(false);
    }
  }

  const dirtyCount = isDirty ? Math.abs(rows.length - initial.length) || 1 : 0;

  return (
    <div className="space-y-4 pb-24">
      {!canEdit && (
        <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
          Chế độ chỉ xem — cần quyền <strong className="text-foreground">editor</strong> để sửa.
        </div>
      )}
      {/* Toolbar */}
      {canEdit && (
        <div className="flex items-center gap-2 flex-wrap p-3 rounded-lg border border-border bg-surface">
          <button
            onClick={addRow}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border bg-background text-xs font-medium hover:bg-surface-muted"
          >
            <Plus className="w-3.5 h-3.5" /> Thêm hàng
          </button>
          <button
            onClick={removeRow}
            disabled={!selectedRow}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border bg-background text-xs font-medium hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-3.5 h-3.5" /> Xóa hàng
          </button>
          {!isMetaKv && (
            <>
              <div className="h-5 w-px bg-border mx-1" />
              <button
                onClick={addColumn}
                className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border bg-background text-xs font-medium hover:bg-surface-muted"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm cột
              </button>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    removeColumn(e.target.value);
                    e.target.value = "";
                  }
                }}
                defaultValue=""
                className="h-8 px-2 rounded-md border border-border bg-background text-xs"
              >
                <option value="">Xóa cột…</option>
                {cols
                  .filter((c) => c.code !== "kg")
                  .map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
              </select>
            </>
          )}
          <div className="ml-auto text-[11px] text-muted-foreground">
            {rows.length} {isMetaKv ? "keys" : "rows"}
            {!isMetaKv ? ` × ${cols.length} cols` : ""}
            {selectedRow && <span className="ml-2 text-primary">• 1 selected</span>}
          </div>
        </div>
      )}

      {/* Grid */}
      <div
        className="rounded-lg border border-border overflow-hidden bg-background"
        style={{ height: 540 }}
      >
        <DataGrid
          columns={gridColumns}
          rows={rows}
          rowKeyGetter={(r) => r.__id}
          onRowsChange={setRows}
          onCellClick={(args) => setSelectedRow(args.row.__id)}
          rowHeight={32}
          headerRowHeight={36}
          className="rdg-light"
        />
      </div>

      {/* Tip */}
      <div className="rounded-lg border border-info/20 bg-info/5 p-3 text-xs text-muted-foreground">
        <strong>Mẹo:</strong> Click ô để edit; Enter để confirm; Escape để hủy. Click 1 hàng để chọn
        rồi "Xóa hàng". Click "Thêm cột" để thêm mã quốc gia mới (vd{" "}
        <code className="font-mono px-1 bg-muted rounded">jp</code>,{" "}
        <code className="font-mono px-1 bg-muted rounded">sg</code>).
      </div>

      {/* Sticky save bar */}
      {canEdit && isDirty && (
        <div className="fixed bottom-0 right-0 lg:left-65 lg:right-0 z-30 border-t border-border bg-background/95 backdrop-blur-xl p-3 shadow-elevated">
          <div className="max-w-7xl mx-auto flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              {dirtyCount} thay đổi chưa lưu
            </span>
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Ghi chú thay đổi (optional)…"
              className="flex-1 min-w-48 h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={pending}
            />
            <button
              onClick={discard}
              disabled={pending}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-surface text-sm font-medium hover:bg-surface-muted disabled:opacity-50"
            >
              <Undo2 className="w-4 h-4" /> Bỏ thay đổi
            </button>
            <button
              onClick={handleSave}
              disabled={pending}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-foreground text-background text-sm font-semibold hover:opacity-90 disabled:opacity-50 shadow-soft"
            >
              <Save className="w-4 h-4" /> {pending ? "Đang lưu…" : `Lưu v${table.version + 1}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
