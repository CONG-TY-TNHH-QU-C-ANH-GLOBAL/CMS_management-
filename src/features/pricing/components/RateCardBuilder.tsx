// Rate Card Builder — orchestrator for weight_grid pricing tables.
//
// Composes the editor hook, grid, toolbar, dialogs, validation summary, sticky
// save bar, draft-restore banner, and version history/rollback. Keeps the
// meta_kv editor untouched (the route picks the editor by kind).

import { useBlocker, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, History, Lock, RefreshCw, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  rollbackPricingTableFn,
  savePricingTableFn,
  type PricingTableRow,
  type PricingVersionRow,
} from "@/features/pricing/pricing.actions";

import { exportCsv } from "../rateCardCsv";
import type { DiffResult, RateCardColumn } from "../rateCardTypes";
import { useRateCardEditor, type OpResult } from "../useRateCardEditor";
import { FormulaGeneratorDialog } from "./FormulaGeneratorDialog";
import { ImportRateCardDialog } from "./ImportRateCardDialog";
import { MassUpdateDialog } from "./MassUpdateDialog";
import { RateCardDiffDialog } from "./RateCardDiffDialog";
import { RateCardGrid } from "./RateCardGrid";
import { RateCardToolbar } from "./RateCardToolbar";
import { primaryBtn, secondaryBtn } from "./rateCardUi";

interface Props {
  table: PricingTableRow & { schema: unknown; data: unknown };
  versions: PricingVersionRow[];
  /** Whether the current user may edit/publish/rollback (role ≥ editor).
   *  Backend enforces this independently; this only gates the UI affordances. */
  canEdit: boolean;
}

const EMPTY_DIFF: DiffResult = { rows: [], added: 0, removed: 0, updated: 0, unchanged: 0 };

function schemaColumns(schema: unknown): RateCardColumn[] {
  const s = schema as { columns?: RateCardColumn[]; currency?: string; step?: number } | null;
  return s?.columns ?? [];
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString("vi-VN");
}

export function RateCardBuilder({ table, versions, canEdit }: Props) {
  const router = useRouter();
  const save = useServerFn(savePricingTableFn);
  const rollback = useServerFn(rollbackPricingTableFn);

  const schemaCols = schemaColumns(table.schema);
  const schemaMeta = table.schema as { currency?: string; step?: number } | null;

  const editor = useRateCardEditor({
    slug: table.slug,
    version: table.version,
    data: table.data,
    schemaCols,
    schemaRaw: table.schema,
    declaredStep: schemaMeta?.step ?? null,
    currency: schemaMeta?.currency,
    onPublish: async ({ data_json, schema_json, comment, expectedVersion }) => {
      await save({ data: { slug: table.slug, data_json, schema_json, comment, expectedVersion } });
      await router.invalidate();
    },
  });

  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [formulaOpen, setFormulaOpen] = useState(false);
  const [massOpen, setMassOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [rollingBack, setRollingBack] = useState<number | null>(null);
  const [conflict, setConflict] = useState(false);

  // Block in-app navigation while there are unsaved (un-published) changes.
  // The hook's beforeunload covers tab close/reload; this covers SPA routing.
  useBlocker({
    shouldBlockFn: () =>
      editor.isDirty && !window.confirm("Có thay đổi chưa publish. Rời trang và bỏ thay đổi?"),
    enableBeforeUnload: false,
  });

  const anyDialogOpen = formulaOpen || massOpen || importOpen || diffOpen;

  // --- Keyboard shortcuts (undo/redo/save) ---
  // Destructure the stable useCallback methods so the effect only re-binds when
  // a handler actually changes, not on every render of the (per-render) editor.
  const { undo, redo, saveDraft } = editor;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (anyDialogOpen) return;
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        redo();
      } else if (key === "s") {
        e.preventDefault();
        saveDraft();
        toast.success("Đã lưu nháp (cục bộ)");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, saveDraft, anyDialogOpen]);

  const handlePasteButton = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        toast.warning("Clipboard rỗng");
        return;
      }
      // Reuse the grid paste path by simulating an anchored paste at A1 is not
      // ideal; instead inform the operator to use Ctrl+V which anchors at the
      // focused cell. We still support a top-left paste here for convenience.
      const { parseClipboardMatrix, applyPaste } = await import("../rateCardParse");
      const matrix = parseClipboardMatrix(text);
      const plain = editor.plainRows;
      const result = applyPaste(plain, editor.cols, 0, 0, matrix);
      editor.applyOp(
        { rows: result.rows, changedCells: result.changedCells },
        `Dán ${matrix.length} dòng · ${result.cellsUpdated} ô`,
      );
      toast.success(
        `Đã dán ${matrix.length} dòng · ${result.cellsUpdated} ô${result.notes.length ? ` · ${result.notes.join("; ")}` : ""}`,
      );
    } catch {
      toast.error("Không đọc được clipboard — hãy click 1 ô rồi nhấn Ctrl+V");
    }
  }, [editor]);

  const handleExport = useCallback(() => {
    const csv = exportCsv(editor.plainRows, editor.cols);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${table.slug}_v${table.version}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [editor.plainRows, editor.cols, table.slug, table.version]);

  const handleAddColumn = useCallback(() => {
    const code = window.prompt("Mã cột mới (vd: hn, jp, sg):")?.trim();
    if (!code) return;
    if (editor.cols.some((c) => c.code === code)) {
      toast.error(`Cột "${code}" đã tồn tại`);
      return;
    }
    const label =
      window.prompt("Tên hiển thị cột:", code.toUpperCase())?.trim() ?? code.toUpperCase();
    editor.addColumn(code, label);
  }, [editor]);

  const handleApplyOp = useCallback(
    (result: OpResult, label: string) => {
      editor.applyOp(result, label);
      // Selection is consumed by the op (or invalidated by row replacement);
      // clear it so stale row ids don't carry into the next action.
      setSelectedRowIds(new Set());
      toast.success(label);
    },
    [editor],
  );

  const handlePublish = useCallback(
    async (note: string) => {
      try {
        await editor.publish(note.trim() || null);
        toast.success("Đã publish — đã tạo version mới & cập nhật web");
        setDiffOpen(false);
        setSelectedRowIds(new Set());
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Publish thất bại";
        // Optimistic-concurrency conflict: someone else published since load.
        if (/VERSION_CONFLICT|Phiên bản đã thay đổi/i.test(msg)) {
          setConflict(true);
          setDiffOpen(false);
          toast.error(msg);
        } else {
          toast.error(msg);
        }
      }
    },
    [editor],
  );

  const handleRollback = useCallback(
    async (version: number) => {
      if (!confirm(`Rollback về version ${version}? Sẽ tạo một version mới từ snapshot này.`))
        return;
      setRollingBack(version);
      try {
        await rollback({ data: { slug: table.slug, toVersion: version } });
        toast.success(`Đã rollback về v${version} (tạo version mới)`);
        await router.invalidate();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Rollback thất bại");
      } finally {
        setRollingBack(null);
      }
    },
    [rollback, router, table.slug],
  );

  const removableColumns = editor.cols
    .filter((c) => c.code !== editor.config.weightCol)
    .map((c) => ({ code: c.code, label: c.label }));

  const { validation } = editor;
  const statusLabel: Record<string, { text: string; cls: string }> = {
    published: {
      text: "Đang publish (khớp web)",
      cls: "bg-emerald-100 text-emerald-800 border-emerald-300",
    },
    draft_dirty: { text: "Nháp — chưa lưu", cls: "bg-amber-100 text-amber-800 border-amber-300" },
    validation_failed: {
      text: "Có lỗi nghiêm trọng",
      cls: "bg-red-100 text-red-800 border-red-300",
    },
    ready_to_publish: {
      text: "Sẵn sàng publish",
      cls: "bg-blue-100 text-blue-800 border-blue-300",
    },
    publishing: { text: "Đang publish…", cls: "bg-blue-100 text-blue-800 border-blue-300" },
  };
  const st = statusLabel[editor.status];

  return (
    <div className="space-y-3 pb-28">
      {/* Version-conflict banner (someone else published since load) */}
      {conflict && (
        <div className="flex items-center gap-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-xs">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span className="text-red-800">
            <strong>Xung đột phiên bản:</strong> bảng giá đã được người khác publish sau khi bạn mở.
            Tải lại để xem bản mới nhất rồi áp dụng lại thay đổi của bạn.
          </span>
          <button
            className="ml-auto inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700"
            onClick={() => {
              setConflict(false);
              void router.invalidate();
            }}
          >
            <RefreshCw className="w-3.5 h-3.5" /> Tải lại
          </button>
        </div>
      )}

      {/* Read-only banner for viewers */}
      {!canEdit && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
          <Lock className="w-3.5 h-3.5 shrink-0" />
          Bạn đang ở chế độ chỉ xem — cần quyền <strong className="text-foreground">
            editor
          </strong>{" "}
          để sửa/publish bảng giá.
        </div>
      )}

      {/* Restore-draft banner */}
      {canEdit && editor.storedDraftAt && !editor.isDirty && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs">
          <History className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="text-blue-800">
            Có nháp lưu cục bộ lúc <strong>{formatTime(editor.storedDraftAt)}</strong>.
          </span>
          <div className="ml-auto flex gap-2">
            <button
              className="h-7 px-2.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
              onClick={() => {
                if (editor.restoreDraft()) toast.success("Đã khôi phục nháp");
              }}
            >
              Khôi phục
            </button>
            <button
              className="h-7 px-2.5 rounded-md border border-blue-300 bg-white text-blue-700 text-xs font-medium hover:bg-blue-100"
              onClick={() => {
                editor.clearDraft();
                toast.message("Đã bỏ nháp cục bộ");
              }}
            >
              Bỏ nháp
            </button>
          </div>
        </div>
      )}

      {canEdit && (
        <RateCardToolbar
          selectedCount={selectedRowIds.size}
          rowCount={editor.rows.length}
          colCount={editor.cols.length}
          canUndo={editor.canUndo}
          canRedo={editor.canRedo}
          onAddRow={editor.addRow}
          onRemoveRows={() => {
            editor.removeRows(selectedRowIds);
            setSelectedRowIds(new Set());
          }}
          onPasteFromClipboard={handlePasteButton}
          onOpenFormula={() => setFormulaOpen(true)}
          onOpenMassUpdate={() => setMassOpen(true)}
          onOpenImport={() => setImportOpen(true)}
          onExport={handleExport}
          onAddColumn={handleAddColumn}
          onRemoveColumn={editor.removeColumn}
          onUndo={editor.undo}
          onRedo={editor.redo}
          removableColumns={removableColumns}
        />
      )}
      {/* Viewers still get Export (read-only, safe) */}
      {!canEdit && (
        <div className="flex">
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border bg-background text-xs font-medium hover:bg-surface-muted"
          >
            Export CSV
          </button>
        </div>
      )}

      <div className={showHistory ? "grid lg:grid-cols-[1fr_300px] gap-4" : ""}>
        <div className="min-w-0 space-y-3">
          {/* Validation summary */}
          <div className="flex items-center gap-2 text-xs flex-wrap">
            {validation.criticalCount === 0 ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-700">
                <CheckCircle2 className="w-4 h-4" /> Không có lỗi nghiêm trọng
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-red-600 font-medium">
                <AlertTriangle className="w-4 h-4" /> {validation.criticalCount} lỗi nghiêm trọng
              </span>
            )}
            {validation.warningCount > 0 && (
              <span className="inline-flex items-center gap-1.5 text-amber-700">
                <AlertTriangle className="w-4 h-4" /> {validation.warningCount} cảnh báo
              </span>
            )}
            <button
              onClick={() => setShowHistory((s) => !s)}
              className="ml-auto inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border bg-surface hover:bg-surface-muted"
            >
              <History className="w-3.5 h-3.5" /> Lịch sử ({versions.length})
            </button>
          </div>

          <RateCardGrid
            rows={editor.rows}
            cols={editor.cols}
            config={editor.config}
            validation={validation}
            changedCells={editor.changedCells}
            onGridRowsChange={editor.setGridRows}
            onApplyOp={(result, label) => {
              editor.applyOp(result, label);
            }}
            selectedRowIds={selectedRowIds}
            onSelectedRowIdsChange={setSelectedRowIds}
            readOnly={!canEdit}
          />

          <div className="rounded-lg border border-info/20 bg-info/5 p-3 text-xs text-muted-foreground">
            <strong>Mẹo:</strong> Click 1 ô rồi{" "}
            <kbd className="px-1 bg-muted rounded font-mono">Ctrl+V</kbd> để dán từ Excel/Sheets (tự
            thêm dòng).
            <kbd className="px-1 bg-muted rounded font-mono ml-1">Ctrl+Z</kbd>/
            <kbd className="px-1 bg-muted rounded font-mono">Ctrl+Y</kbd> hoàn tác/làm lại. Giá nhập
            kiểu <code className="font-mono">1.387.634</code> hay{" "}
            <code className="font-mono">1,387,634</code> đều tự chuẩn hóa.
          </div>
        </div>

        {showHistory && (
          <div className="self-start lg:sticky lg:top-20 rounded-lg border border-border bg-surface p-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Lịch sử & rollback ({versions.length})
            </div>
            {versions.length === 0 ? (
              <div className="text-xs text-muted-foreground italic">Chưa có version nào.</div>
            ) : (
              <ul className="space-y-2">
                {versions.map((v) => (
                  <li key={v.id} className="text-xs border-l-2 border-border pl-3 py-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">v{v.version}</span>
                      {canEdit && (
                        <button
                          onClick={() => handleRollback(v.version)}
                          disabled={rollingBack !== null}
                          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
                          title={`Rollback về v${v.version}`}
                        >
                          <RotateCcw className="w-3 h-3" />{" "}
                          {rollingBack === v.version ? "Đang…" : "Rollback"}
                        </button>
                      )}
                    </div>
                    <div className="text-muted-foreground mt-0.5">
                      {new Date(v.created_at * 1000).toLocaleString("vi-VN")}
                    </div>
                    {v.comment && (
                      <div className="mt-0.5 italic text-foreground/80">"{v.comment}"</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Sticky action bar */}
      {canEdit && editor.isDirty && (
        <div className="fixed bottom-0 right-0 lg:left-65 lg:right-0 z-30 border-t border-border bg-background/95 backdrop-blur-xl p-3 shadow-elevated">
          <div className="max-w-7xl mx-auto flex items-center gap-3 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${st.cls}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" /> {st.text}
            </span>
            {editor.lastOpLabel && (
              <span className="text-[11px] text-muted-foreground hidden sm:inline">
                {editor.lastOpLabel}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button
                className={secondaryBtn}
                onClick={() => {
                  editor.saveDraft();
                  toast.success("Đã lưu nháp (cục bộ)");
                }}
              >
                Lưu nháp
              </button>
              <button
                className={secondaryBtn}
                onClick={() => {
                  if (confirm("Bỏ tất cả thay đổi chưa publish?")) editor.discard();
                }}
              >
                Bỏ thay đổi
              </button>
              <button className={primaryBtn} onClick={() => setDiffOpen(true)}>
                Xem thay đổi & Publish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <FormulaGeneratorDialog
        open={formulaOpen}
        onClose={() => setFormulaOpen(false)}
        config={editor.config}
        cols={editor.cols}
        rows={editor.rows}
        selectedRowIds={selectedRowIds}
        onApply={handleApplyOp}
      />
      <MassUpdateDialog
        open={massOpen}
        onClose={() => setMassOpen(false)}
        config={editor.config}
        cols={editor.cols}
        rows={editor.rows}
        selectedRowIds={selectedRowIds}
        onApply={handleApplyOp}
      />
      <ImportRateCardDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        cols={editor.cols}
        onApply={handleApplyOp}
      />
      <RateCardDiffDialog
        open={diffOpen}
        onClose={() => setDiffOpen(false)}
        diff={diffOpen ? editor.computeDiff() : EMPTY_DIFF}
        validation={validation}
        config={editor.config}
        publishing={editor.publishing}
        onSaveDraft={() => {
          editor.saveDraft();
          toast.success("Đã lưu nháp (cục bộ)");
        }}
        onPublish={handlePublish}
      />
    </div>
  );
}
