// Rate Card Builder — toolbar. Presentational: emits intents, owns no logic.

import {
  ClipboardPaste,
  Columns3,
  Download,
  FunctionSquare,
  Plus,
  Redo2,
  Sigma,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";

import { toolbarBtn } from "./rateCardUi";

interface Props {
  selectedCount: number;
  rowCount: number;
  colCount: number;
  canUndo: boolean;
  canRedo: boolean;
  onAddRow: () => void;
  onRemoveRows: () => void;
  onPasteFromClipboard: () => void;
  onOpenFormula: () => void;
  onOpenMassUpdate: () => void;
  onOpenImport: () => void;
  onExport: () => void;
  onAddColumn: () => void;
  onRemoveColumn: (code: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  removableColumns: { code: string; label: string }[];
}

function Divider() {
  return <div className="h-5 w-px bg-border mx-0.5" />;
}

export function RateCardToolbar({
  selectedCount,
  rowCount,
  colCount,
  canUndo,
  canRedo,
  onAddRow,
  onRemoveRows,
  onPasteFromClipboard,
  onOpenFormula,
  onOpenMassUpdate,
  onOpenImport,
  onExport,
  onAddColumn,
  onRemoveColumn,
  onUndo,
  onRedo,
  removableColumns,
}: Props) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap p-2.5 rounded-lg border border-border bg-surface">
      <button onClick={onAddRow} className={toolbarBtn}>
        <Plus className="w-3.5 h-3.5" /> Thêm hàng
      </button>
      <button onClick={onRemoveRows} disabled={selectedCount === 0} className={toolbarBtn}>
        <Trash2 className="w-3.5 h-3.5" /> Xóa hàng{selectedCount > 0 ? ` (${selectedCount})` : ""}
      </button>

      <Divider />

      <button
        onClick={onPasteFromClipboard}
        className={toolbarBtn}
        title="Dán từ Excel/Sheets (hoặc Ctrl+V vào ô)"
      >
        <ClipboardPaste className="w-3.5 h-3.5" /> Dán
      </button>
      <button onClick={onOpenFormula} className={toolbarBtn}>
        <FunctionSquare className="w-3.5 h-3.5" /> Công thức
      </button>
      <button onClick={onOpenMassUpdate} className={toolbarBtn}>
        <Sigma className="w-3.5 h-3.5" /> Cập nhật hàng loạt
      </button>

      <Divider />

      <button onClick={onOpenImport} className={toolbarBtn}>
        <Upload className="w-3.5 h-3.5" /> Import Excel/CSV
      </button>
      <button onClick={onExport} className={toolbarBtn}>
        <Download className="w-3.5 h-3.5" /> Export CSV
      </button>

      <Divider />

      <button onClick={onAddColumn} className={toolbarBtn} title="Thêm cột mã quốc gia/giá">
        <Columns3 className="w-3.5 h-3.5" /> Thêm cột
      </button>
      {removableColumns.length > 0 && (
        <select
          onChange={(e) => {
            if (e.target.value) {
              onRemoveColumn(e.target.value);
              e.target.value = "";
            }
          }}
          defaultValue=""
          className="h-8 px-2 rounded-md border border-border bg-background text-xs"
        >
          <option value="">Xóa cột…</option>
          {removableColumns.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code}
            </option>
          ))}
        </select>
      )}

      <Divider />

      <button onClick={onUndo} disabled={!canUndo} className={toolbarBtn} title="Hoàn tác (Ctrl+Z)">
        <Undo2 className="w-3.5 h-3.5" />
      </button>
      <button onClick={onRedo} disabled={!canRedo} className={toolbarBtn} title="Làm lại (Ctrl+Y)">
        <Redo2 className="w-3.5 h-3.5" />
      </button>

      <div className="ml-auto text-[11px] text-muted-foreground">
        {rowCount} dòng × {colCount} cột
        {selectedCount > 0 && <span className="ml-2 text-primary">• {selectedCount} chọn</span>}
      </div>
    </div>
  );
}
