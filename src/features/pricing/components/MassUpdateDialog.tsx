// Rate Card Builder — Mass Update dialog. Scoped bulk price ops with a live
// impact preview (affected rows, min/max old/new, largest % change).

import { useMemo, useState } from "react";

import {
  computeMassUpdate,
  type MassOp,
  type MassRounding,
  type MassScope,
  type MassUpdateSpec,
} from "../rateCardMassUpdate";
import { formatCellBySemantic, type GridConfig, type RateCardColumn } from "../rateCardTypes";
import type { GridRow, OpResult } from "../useRateCardEditor";
import {
  Field,
  RateCardDialogShell,
  formatPct,
  inputClass,
  primaryBtn,
  secondaryBtn,
  selectClass,
} from "./rateCardUi";

interface Props {
  open: boolean;
  onClose: () => void;
  config: GridConfig;
  cols: RateCardColumn[];
  rows: GridRow[];
  selectedRowIds: Set<string>;
  onApply: (result: OpResult, label: string) => void;
}

type ScopeKind = "all" | "selected" | "weight_range";
type OpKind = MassOp["type"];

const OPS: { value: OpKind; label: string; needsValue: boolean }[] = [
  { value: "increase_pct", label: "Tăng theo %", needsValue: true },
  { value: "decrease_pct", label: "Giảm theo %", needsValue: true },
  { value: "add", label: "Cộng VNĐ", needsValue: true },
  { value: "subtract", label: "Trừ VNĐ", needsValue: true },
  { value: "multiply", label: "Nhân hệ số", needsValue: true },
  { value: "round", label: "Chỉ làm tròn", needsValue: false },
];

const ROUNDINGS: { value: MassRounding; label: string }[] = [
  { value: "none", label: "Không làm tròn" },
  { value: "nearest_1000", label: "Gần nhất 1.000" },
  { value: "ceil_1000", label: "Làm tròn lên 1.000" },
  { value: "floor_1000", label: "Làm tròn xuống 1.000" },
  { value: "nearest_10000", label: "Gần nhất 10.000" },
];

export function MassUpdateDialog({
  open,
  onClose,
  config,
  cols,
  rows,
  selectedRowIds,
  onApply,
}: Props) {
  const [scopeKind, setScopeKind] = useState<ScopeKind>("all");
  const [rangeFrom, setRangeFrom] = useState("0");
  const [rangeTo, setRangeTo] = useState("20");
  const [opKind, setOpKind] = useState<OpKind>("increase_pct");
  const [opValue, setOpValue] = useState("5");
  const [rounding, setRounding] = useState<MassRounding>("nearest_1000");
  const [priceCol, setPriceCol] = useState(config.priceCols[0] ?? "");

  const plain = useMemo(
    () =>
      rows.map(({ __id, ...rest }) => {
        void __id;
        return rest;
      }),
    [rows],
  );

  const selectedIndices = useMemo(
    () => rows.map((r, i) => (selectedRowIds.has(r.__id) ? i : -1)).filter((i) => i >= 0),
    [rows, selectedRowIds],
  );

  const spec: MassUpdateSpec = useMemo(() => {
    const scope: MassScope =
      scopeKind === "all"
        ? { type: "all" }
        : scopeKind === "selected"
          ? { type: "selected", indices: selectedIndices }
          : { type: "weight_range", from: Number(rangeFrom), to: Number(rangeTo) };
    const value = Number(opValue) || 0;
    const operation: MassOp = opKind === "round" ? { type: "round" } : { type: opKind, value };
    return { scope, operation, rounding, weightCol: config.weightCol, priceCol };
  }, [
    scopeKind,
    selectedIndices,
    rangeFrom,
    rangeTo,
    opKind,
    opValue,
    rounding,
    config.weightCol,
    priceCol,
  ]);

  const computed = useMemo(() => computeMassUpdate(plain, spec), [plain, spec]);
  const p = computed.preview;
  const targetSemantic = config.semanticByCol[priceCol] ?? "unknown";
  const needsValue = OPS.find((o) => o.value === opKind)?.needsValue ?? true;

  function handleApply() {
    onApply(
      { rows: computed.rows, changedCells: computed.changedCells },
      `Cập nhật hàng loạt: ${p.affectedRows} dòng${p.skippedRows ? ` · ${p.skippedRows} bỏ qua` : ""}`,
    );
    onClose();
  }

  return (
    <RateCardDialogShell
      open={open}
      onClose={onClose}
      title="Cập nhật giá hàng loạt"
      description="Áp dụng phép tính cho nhiều dòng cùng lúc. Xem tác động trước khi áp dụng vào nháp."
      size="max-w-2xl"
      footer={
        <>
          <button className={secondaryBtn} onClick={onClose}>
            Hủy
          </button>
          <button className={primaryBtn} onClick={handleApply} disabled={p.affectedRows === 0}>
            Áp dụng vào nháp
          </button>
        </>
      }
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Phạm vi">
          <select
            className={selectClass}
            value={scopeKind}
            onChange={(e) => setScopeKind(e.target.value as ScopeKind)}
          >
            <option value="all">Tất cả dòng</option>
            <option value="selected">Dòng đang chọn ({selectedIndices.length})</option>
            <option value="weight_range">Khoảng cân nặng</option>
          </select>
        </Field>
        <Field label="Cột giá đích">
          <select
            className={selectClass}
            value={priceCol}
            onChange={(e) => setPriceCol(e.target.value)}
          >
            {config.priceCols.map((c) => (
              <option key={c} value={c}>
                {cols.find((col) => col.code === c)?.label ?? c}
              </option>
            ))}
          </select>
        </Field>

        {scopeKind === "weight_range" && (
          <>
            <Field label="Từ cân nặng">
              <input
                className={inputClass}
                value={rangeFrom}
                onChange={(e) => setRangeFrom(e.target.value)}
                inputMode="decimal"
              />
            </Field>
            <Field label="Đến cân nặng">
              <input
                className={inputClass}
                value={rangeTo}
                onChange={(e) => setRangeTo(e.target.value)}
                inputMode="decimal"
              />
            </Field>
          </>
        )}

        <Field label="Phép tính">
          <select
            className={selectClass}
            value={opKind}
            onChange={(e) => setOpKind(e.target.value as OpKind)}
          >
            {OPS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        {needsValue && (
          <Field label="Giá trị">
            <input
              className={inputClass}
              value={opValue}
              onChange={(e) => setOpValue(e.target.value)}
              inputMode="decimal"
            />
          </Field>
        )}
        <Field label="Làm tròn">
          <select
            className={selectClass}
            value={rounding}
            onChange={(e) => setRounding(e.target.value as MassRounding)}
          >
            {ROUNDINGS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-4 rounded-md border border-border bg-surface/60 p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <Stat label="Dòng ảnh hưởng" value={String(p.affectedRows)} />
        <Stat label="Bỏ qua (không phải số)" value={String(p.skippedRows)} />
        <Stat
          label="Giá cũ (min → max)"
          value={`${formatCellBySemantic(p.oldMin, targetSemantic)} → ${formatCellBySemantic(p.oldMax, targetSemantic)}`}
        />
        <Stat
          label="Giá mới (min → max)"
          value={`${formatCellBySemantic(p.newMin, targetSemantic)} → ${formatCellBySemantic(p.newMax, targetSemantic)}`}
        />
        <Stat
          label="Thay đổi lớn nhất"
          value={formatPct(p.largestChangePct)}
          alert={p.largestChangePct !== null && p.largestChangePct > 30}
        />
      </div>
    </RateCardDialogShell>
  );
}

function Stat({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div
        className={`mt-0.5 font-semibold tabular-nums ${alert ? "text-amber-600" : "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}
