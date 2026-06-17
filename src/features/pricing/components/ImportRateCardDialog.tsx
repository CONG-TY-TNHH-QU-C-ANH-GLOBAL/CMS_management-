// Rate Card Builder — Import dialog. Excel (.xlsx) + CSV. Parse → preview →
// apply to draft. Never auto-publishes.

import { useRef, useState } from "react";
import { FileUp } from "lucide-react";

import { parseCsvImport, parseXlsxImport, type ImportParseResult } from "../rateCardCsv";
import { formatCellBySemantic, type RateCardColumn } from "../rateCardTypes";
import type { OpResult } from "../useRateCardEditor";
import { RateCardDialogShell, primaryBtn, secondaryBtn } from "./rateCardUi";

interface Props {
  open: boolean;
  onClose: () => void;
  cols: RateCardColumn[];
  onApply: (result: OpResult, label: string) => void;
}

export function ImportRateCardDialog({ open, onClose, cols, onApply }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ImportParseResult | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setParsed(null);
    setFileName("");
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleFile(file: File) {
    setError(null);
    try {
      const isExcel = /\.(xlsx|xls)$/i.test(file.name);
      const result = isExcel
        ? await parseXlsxImport(await file.arrayBuffer(), cols)
        : parseCsvImport(await file.text(), cols);
      if (result.rows.length === 0) {
        setError(result.notes[0] ?? "Không đọc được dòng dữ liệu nào");
        setParsed(null);
        return;
      }
      setParsed(result);
      setFileName(file.name);
    } catch {
      setError("Không đọc được file (kiểm tra định dạng .xlsx/.csv)");
    }
  }

  function handleApply() {
    if (!parsed) return;
    // Import replaces the whole table (rows come from file), as a draft op.
    const changedCells: string[] = [];
    parsed.rows.forEach((_, i) => cols.forEach((c) => changedCells.push(`${i}:${c.code}`)));
    onApply(
      { rows: parsed.rows, changedCells },
      `Import CSV: ${parsed.rows.length} dòng từ "${fileName}"`,
    );
    reset();
    onClose();
  }

  function close() {
    reset();
    onClose();
  }

  return (
    <RateCardDialogShell
      open={open}
      onClose={close}
      title="Import bảng giá từ Excel/CSV"
      description="Tải lên file Excel (.xlsx) hoặc CSV → xem trước → áp dụng vào nháp. Không tự động publish."
      size="max-w-2xl"
      footer={
        <>
          <button className={secondaryBtn} onClick={close}>
            Hủy
          </button>
          <button className={primaryBtn} onClick={handleApply} disabled={!parsed}>
            Áp dụng vào nháp
          </button>
        </>
      }
    >
      <label
        className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-surface/50 px-4 py-8 cursor-pointer hover:bg-surface-muted transition"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) void handleFile(f);
        }}
      >
        <FileUp className="w-6 h-6 text-muted-foreground" />
        <span className="text-sm font-medium">
          Kéo thả file Excel (.xlsx) hoặc CSV vào đây hoặc bấm để chọn
        </span>
        <span className="text-[11px] text-muted-foreground">
          Google Sheets: tải xuống dạng .xlsx hoặc copy/paste trực tiếp vào bảng. Dữ liệu sẽ được
          xem trước, không tự publish.
        </span>
        <span className="text-[11px] text-muted-foreground">
          Cột nhận dạng theo tiêu đề ({cols.map((c) => c.code).join(", ")}) hoặc theo thứ tự
        </span>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
      </label>

      {error && (
        <div className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {parsed && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span>
              <strong className="text-foreground">{fileName}</strong> · {parsed.rows.length} dòng
              {parsed.hasHeader ? " · có tiêu đề" : " · map theo thứ tự"}
            </span>
          </div>
          {parsed.notes.length > 0 && (
            <ul className="mb-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 list-disc list-inside">
              {parsed.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
          <div className="rounded-md border border-border overflow-hidden max-h-60 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface">
                <tr className="text-left text-muted-foreground border-b border-border">
                  {cols.map((c) => (
                    <th key={c.code} className="px-3 py-1.5 font-medium">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, 50).map((r, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    {cols.map((c) => (
                      <td key={c.code} className="px-3 py-1.5 tabular-nums">
                        {formatCellBySemantic(r[c.code], c.semantic ?? "unknown")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsed.rows.length > 50 && (
            <div className="text-[11px] text-muted-foreground mt-1 text-center">
              … xem trước 50/{parsed.rows.length} dòng
            </div>
          )}
        </div>
      )}
    </RateCardDialogShell>
  );
}
