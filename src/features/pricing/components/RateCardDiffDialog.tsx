// Rate Card Builder — Review Diff dialog. The publish gate: shows added /
// removed / updated rows with old→new + amount + %, surfaces validation
// criticals/warnings. Critical errors block Publish until the operator
// explicitly acknowledges them — some real tables legitimately have gaps
// (e.g. no rate for a country at every weight step).

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Save, ShieldAlert, Upload } from "lucide-react";

import {
  formatCellBySemantic,
  type DiffResult,
  type SemanticType,
  type GridConfig,
  type ValidationResult,
} from "../rateCardTypes";
import {
  RateCardDialogShell,
  formatPct,
  formatSigned,
  inputClass,
  primaryBtn,
  secondaryBtn,
} from "./rateCardUi";

interface Props {
  open: boolean;
  onClose: () => void;
  diff: DiffResult;
  validation: ValidationResult;
  config: GridConfig;
  /** Config of the published table, to format old values in their own currency. */
  publishedConfig: GridConfig;
  publishing: boolean;
  onSaveDraft: () => void;
  onPublish: (note: string) => void;
}

type Filter = "changed" | "all";

export function RateCardDiffDialog({
  open,
  onClose,
  diff,
  validation,
  config,
  publishedConfig,
  publishing,
  onSaveDraft,
  onPublish,
}: Props) {
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState<Filter>("changed");
  const [confirm, setConfirm] = useState(false);
  const [acceptCritical, setAcceptCritical] = useState(false);

  const hasCritical = validation.criticalCount > 0;
  const blocked = hasCritical && !acceptCritical;
  const noChanges = diff.added + diff.removed + diff.updated === 0;

  const visibleRows = useMemo(
    () => (filter === "all" ? diff.rows : diff.rows.filter((r) => r.kind !== "unchanged")),
    [diff.rows, filter],
  );

  const priceCols = config.priceCols;

  return (
    <RateCardDialogShell
      open={open}
      onClose={publishing ? () => {} : onClose}
      title="Xem thay đổi trước khi publish"
      description="Kiểm tra kỹ: sai một số 0 có thể làm sai báo giá. Publish sẽ tạo version mới và cập nhật web."
      size="max-w-4xl"
      footer={
        <>
          <button className={secondaryBtn} onClick={onClose} disabled={publishing}>
            Quay lại sửa
          </button>
          <button className={secondaryBtn} onClick={onSaveDraft} disabled={publishing}>
            <Save className="w-4 h-4" /> Lưu nháp
          </button>
          {confirm ? (
            <button
              className={primaryBtn}
              onClick={() => onPublish(note)}
              disabled={blocked || publishing}
            >
              <Upload className="w-4 h-4" /> {publishing ? "Đang publish…" : "Xác nhận publish"}
            </button>
          ) : (
            <button
              className={primaryBtn}
              onClick={() => setConfirm(true)}
              disabled={blocked || noChanges || publishing}
              title={
                blocked
                  ? "Còn lỗi nghiêm trọng — tick xác nhận bên dưới để vẫn publish"
                  : noChanges
                    ? "Không có thay đổi"
                    : undefined
              }
            >
              <Upload className="w-4 h-4" /> Publish
            </button>
          )}
        </>
      }
    >
      {/* Summary chips */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <Chip tone="add" label={`+${diff.added} thêm`} />
        <Chip tone="update" label={`${diff.updated} sửa`} />
        <Chip tone="remove" label={`−${diff.removed} xóa`} />
        <Chip tone="muted" label={`${diff.unchanged} giữ nguyên`} />
        <div className="ml-auto flex items-center gap-1">
          <button
            className={`h-7 px-2 rounded-md text-xs border ${filter === "changed" ? "bg-foreground text-background border-foreground" : "border-border bg-background"}`}
            onClick={() => setFilter("changed")}
          >
            Chỉ thay đổi
          </button>
          <button
            className={`h-7 px-2 rounded-md text-xs border ${filter === "all" ? "bg-foreground text-background border-foreground" : "border-border bg-background"}`}
            onClick={() => setFilter("all")}
          >
            Tất cả
          </button>
        </div>
      </div>

      {/* Validation banners */}
      {hasCritical && (
        <div className="mt-3 flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <strong>{validation.criticalCount} lỗi nghiêm trọng</strong> — nên sửa trước khi
            publish.
            <ul className="mt-1 list-disc list-inside text-red-600">
              {validation.issues
                .filter((i) => i.severity === "critical")
                .slice(0, 5)
                .map((i, idx) => (
                  <li key={idx}>{i.message}</li>
                ))}
            </ul>
            <label className="mt-2 flex items-center gap-2 font-medium text-red-800 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptCritical}
                disabled={publishing}
                onChange={(e) => {
                  setAcceptCritical(e.target.checked);
                  if (!e.target.checked) setConfirm(false);
                }}
              />
              Tôi đã kiểm tra, vẫn publish dù còn {validation.criticalCount} lỗi nghiêm trọng
            </label>
          </div>
        </div>
      )}
      {validation.warningCount > 0 && (
        <div className="mt-3 flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <strong>{validation.warningCount} cảnh báo</strong> — vẫn publish được nhưng nên kiểm
            tra.
            <ul className="mt-1 list-disc list-inside text-amber-700">
              {validation.issues
                .filter((i) => i.severity === "warning")
                .slice(0, 5)
                .map((i, idx) => (
                  <li key={idx}>{i.message}</li>
                ))}
            </ul>
          </div>
        </div>
      )}

      {/* Diff table */}
      <div className="mt-3 rounded-md border border-border overflow-hidden max-h-[44vh] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-surface z-10">
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="px-3 py-2 font-medium w-16">Loại</th>
              <th className="px-3 py-2 font-medium">
                {config.columns.find((c) => c.code === config.weightCol)?.label ?? "Cân nặng"}
              </th>
              {priceCols.map((pc) => (
                <th key={pc} className="px-3 py-2 font-medium text-right">
                  {config.columns.find((c) => c.code === pc)?.label ?? pc}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 && (
              <tr>
                <td
                  colSpan={2 + priceCols.length}
                  className="px-3 py-6 text-center text-muted-foreground italic"
                >
                  Không có thay đổi
                </td>
              </tr>
            )}
            {visibleRows.map((r, idx) => (
              <tr key={idx} className="border-b border-border/50 last:border-0 align-top">
                <td className="px-3 py-1.5">
                  <KindBadge kind={r.kind} />
                </td>
                <td className="px-3 py-1.5 tabular-nums font-medium">{r.key}</td>
                {priceCols.map((pc) => {
                  const sem = config.semanticByCol[pc] ?? "unknown";
                  const oldSem = publishedConfig.semanticByCol[pc] ?? sem;
                  // VND → USD (or back): old and new are different units, so each
                  // carries its own symbol and the amount/% delta is meaningless.
                  const currencyChanged = oldSem !== sem;
                  const change = r.changes.find((c) => c.column === pc);
                  const oldV = r.oldRow?.[pc];
                  const newV = r.newRow?.[pc];
                  if (r.kind === "added")
                    return (
                      <td key={pc} className="px-3 py-1.5 text-right tabular-nums text-emerald-700">
                        {formatCellBySemantic(newV, sem)}
                      </td>
                    );
                  if (r.kind === "removed")
                    return (
                      <td
                        key={pc}
                        className="px-3 py-1.5 text-right tabular-nums text-red-600 line-through"
                      >
                        {formatCellBySemantic(oldV, oldSem)}
                      </td>
                    );
                  if (!change)
                    return (
                      <td
                        key={pc}
                        className="px-3 py-1.5 text-right tabular-nums text-muted-foreground"
                      >
                        {formatCellBySemantic(newV, sem)}
                      </td>
                    );
                  return (
                    <td key={pc} className="px-3 py-1.5 text-right tabular-nums">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="text-muted-foreground line-through">
                          {formatMoney(change.oldValue, oldSem, currencyChanged)}
                        </span>
                        <ArrowRight className="w-3 h-3 text-muted-foreground" />
                        <span className="font-semibold">
                          {formatMoney(change.newValue, sem, currencyChanged)}
                        </span>
                      </div>
                      {change.changeAmount !== null && !currencyChanged && (
                        <div
                          className={`text-[10px] ${change.changeAmount > 0 ? "text-emerald-600" : "text-red-600"}`}
                        >
                          {formatSigned(change.changeAmount)} ({formatPct(change.changePct)})
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Publish note */}
      {confirm && (
        <div className="mt-3">
          <label className="block text-xs font-medium text-foreground mb-1">
            Ghi chú publish (ví dụ: "UPS fuel surcharge Jun 2026")
          </label>
          <input
            className={inputClass}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Mô tả ngắn gọn lý do thay đổi…"
            autoFocus
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Bấm "Xác nhận publish" để tạo version mới. Có thể rollback sau từ lịch sử.
          </p>
        </div>
      )}
    </RateCardDialogShell>
  );
}

/** Format a diff cell; when the currency changed, VND carries "₫" so the
 *  row reads "147.758 ₫ → $5.90" instead of a bare number turning into dollars. */
function formatMoney(
  value: Parameters<typeof formatCellBySemantic>[0],
  semantic: SemanticType,
  showVndSymbol: boolean,
): string {
  const text = formatCellBySemantic(value, semantic);
  return showVndSymbol && semantic === "money_vnd" && text !== "" ? `${text} ₫` : text;
}

function Chip({ tone, label }: { tone: "add" | "update" | "remove" | "muted"; label: string }) {
  const cls = {
    add: "bg-emerald-50 text-emerald-700 border-emerald-200",
    update: "bg-blue-50 text-blue-700 border-blue-200",
    remove: "bg-red-50 text-red-700 border-red-200",
    muted: "bg-surface text-muted-foreground border-border",
  }[tone];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border font-medium ${cls}`}>
      {label}
    </span>
  );
}

function KindBadge({ kind }: { kind: DiffResult["rows"][number]["kind"] }) {
  const map = {
    added: { t: "Thêm", c: "text-emerald-700" },
    removed: { t: "Xóa", c: "text-red-600" },
    updated: { t: "Sửa", c: "text-blue-700" },
    unchanged: { t: "—", c: "text-muted-foreground" },
  }[kind];
  return <span className={`font-medium ${map.c}`}>{map.t}</span>;
}
