// Rate Card Builder — Formula Generator dialog.
// Linear price = basePrice + incrementPerStep * stepIndex, with rounding and
// apply mode. Shows a live preview before applying to the draft.

import { useMemo, useState } from "react";

import {
  applyFormula,
  generateFormulaRows,
  validateFormulaSpec,
  type FormulaApplyMode,
  type FormulaSpec,
  type RoundingUnit,
} from "../rateCardFormula";
import { formatCellBySemantic, type GridConfig, type RateCardColumn } from "../rateCardTypes";
import type { GridRow, OpResult } from "../useRateCardEditor";
import {
  Field,
  RateCardDialogShell,
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

const ROUNDING: { value: RoundingUnit; label: string }[] = [
  { value: 0, label: "Không làm tròn" },
  { value: 1000, label: "Nghìn (1.000)" },
  { value: 10000, label: "Chục nghìn (10.000)" },
  { value: 100000, label: "Trăm nghìn (100.000)" },
];

export function FormulaGeneratorDialog({
  open,
  onClose,
  config,
  cols,
  rows,
  selectedRowIds,
  onApply,
}: Props) {
  const [startWeight, setStartWeight] = useState("0.5");
  const [endWeight, setEndWeight] = useState("20");
  const [step, setStep] = useState(String(config.step ?? 0.5));
  const [basePrice, setBasePrice] = useState("1000000");
  const [increment, setIncrement] = useState("200000");
  const [rounding, setRounding] = useState<RoundingUnit>(1000);
  const [priceCol, setPriceCol] = useState(config.priceCols[0] ?? "");
  const [applyMode, setApplyMode] = useState<FormulaApplyMode>("replace_all");

  const spec: FormulaSpec = useMemo(
    () => ({
      startWeight: Number(startWeight),
      endWeight: Number(endWeight),
      step: Number(step),
      basePrice: Number(basePrice),
      incrementPerStep: Number(increment),
      rounding,
      weightCol: config.weightCol,
      priceCol,
      applyMode,
    }),
    [
      startWeight,
      endWeight,
      step,
      basePrice,
      increment,
      rounding,
      priceCol,
      applyMode,
      config.weightCol,
    ],
  );

  const error = validateFormulaSpec(spec);
  // Generate once; derive both preview and count from the same array.
  const generated = useMemo(() => (error ? [] : generateFormulaRows(spec)), [spec, error]);
  const preview = generated.slice(0, 6);
  const totalRows = generated.length;

  function handleApply() {
    if (error) return;
    const plain = rows.map(({ __id, ...rest }) => {
      void __id;
      return rest;
    });
    const selectedIndices =
      applyMode === "selected_range"
        ? rows.map((r, i) => (selectedRowIds.has(r.__id) ? i : -1)).filter((i) => i >= 0)
        : [];
    const result = applyFormula(plain, cols, spec, selectedIndices);
    onApply(
      { rows: result.rows, changedCells: result.changedCells },
      `Công thức: ${result.affected} dòng${result.notes.length ? ` · ${result.notes.length} bỏ qua` : ""}`,
    );
    onClose();
  }

  const selectedCount = rows.filter((r) => selectedRowIds.has(r.__id)).length;

  return (
    <RateCardDialogShell
      open={open}
      onClose={onClose}
      title="Tạo bảng giá bằng công thức"
      description="Sinh giá tuyến tính theo cân nặng. Xem trước rồi áp dụng vào nháp (chưa publish)."
      size="max-w-2xl"
      footer={
        <>
          <button className={secondaryBtn} onClick={onClose}>
            Hủy
          </button>
          <button className={primaryBtn} onClick={handleApply} disabled={!!error}>
            Áp dụng vào nháp
          </button>
        </>
      }
    >
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Cân nặng bắt đầu">
          <input
            className={inputClass}
            value={startWeight}
            onChange={(e) => setStartWeight(e.target.value)}
            inputMode="decimal"
          />
        </Field>
        <Field label="Cân nặng kết thúc">
          <input
            className={inputClass}
            value={endWeight}
            onChange={(e) => setEndWeight(e.target.value)}
            inputMode="decimal"
          />
        </Field>
        <Field label="Bước nhảy (kg)">
          <input
            className={inputClass}
            value={step}
            onChange={(e) => setStep(e.target.value)}
            inputMode="decimal"
          />
        </Field>
        <Field label="Giá gốc (tại mốc đầu)">
          <input
            className={inputClass}
            value={basePrice}
            onChange={(e) => setBasePrice(e.target.value)}
            inputMode="numeric"
          />
        </Field>
        <Field label="Cộng thêm mỗi bước">
          <input
            className={inputClass}
            value={increment}
            onChange={(e) => setIncrement(e.target.value)}
            inputMode="numeric"
          />
        </Field>
        <Field label="Làm tròn">
          <select
            className={selectClass}
            value={rounding}
            onChange={(e) => setRounding(Number(e.target.value) as RoundingUnit)}
          >
            {ROUNDING.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
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
        <Field
          label="Phạm vi áp dụng"
          hint={applyMode === "selected_range" ? `${selectedCount} dòng đang chọn` : undefined}
        >
          <select
            className={selectClass}
            value={applyMode}
            onChange={(e) => setApplyMode(e.target.value as FormulaApplyMode)}
          >
            <option value="replace_all">Thay toàn bộ bảng</option>
            <option value="fill_empty">Chỉ điền ô giá trống</option>
            <option value="selected_range">Chỉ dòng đang chọn</option>
          </select>
        </Field>
      </div>

      {error ? (
        <div className="mt-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </div>
      ) : (
        <div className="mt-4 rounded-md border border-border overflow-hidden">
          <div className="px-3 py-2 bg-surface text-xs font-medium text-muted-foreground flex items-center justify-between">
            <span>Xem trước</span>
            <span>{totalRows} dòng sẽ được sinh</span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="px-3 py-1.5 font-medium">Cân nặng</th>
                <th className="px-3 py-1.5 font-medium text-right">Giá</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((r, i) => (
                <tr key={i} className="border-b border-border/50 last:border-0">
                  <td className="px-3 py-1.5 tabular-nums">
                    {formatCellBySemantic(r[config.weightCol], "weight")}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatCellBySemantic(r[priceCol], config.semanticByCol[priceCol] ?? "unknown")}
                  </td>
                </tr>
              ))}
              {totalRows > preview.length && (
                <tr>
                  <td colSpan={2} className="px-3 py-1.5 text-center text-muted-foreground italic">
                    … và {totalRows - preview.length} dòng nữa
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </RateCardDialogShell>
  );
}
