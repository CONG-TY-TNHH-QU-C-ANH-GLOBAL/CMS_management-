// Rate Card Builder — exchange rate + whole-table currency conversion.
//
// Presentational: the rate, the table currency and the conversion itself are
// owned by useRateCardEditor so they go through the same draft/publish cycle as
// any other edit. One input, one button: type the rate, convert the grid.

import { ArrowLeftRight } from "lucide-react";
import { useState } from "react";

import { isValidFxRate, parseFxInput, type FxDirection } from "../rateCardFx";

interface Props {
  rate: number | null;
  onRateChange: (rate: number | null) => void;
  /** Current table currency ("VND" | "USD"). Picks the button's direction. */
  currency: string;
  onConvert: (direction: FxDirection) => void;
  readOnly: boolean;
}

export function FxRatePanel({ rate, onRateChange, currency, onConvert, readOnly }: Props) {
  // Keep the raw text so half-typed input ("25.") isn't rewritten under the cursor.
  const [rateText, setRateText] = useState(rate != null ? String(rate) : "");

  const typed = parseFxInput(rateText);
  const rateError =
    rateText.trim() !== "" && !isValidFxRate(typed)
      ? "Tỉ giá phải từ 1.000 đến 1.000.000 VNĐ/USD"
      : null;

  const isUsd = currency.toUpperCase() === "USD";
  const direction: FxDirection = isUsd ? "usd_to_vnd" : "vnd_to_usd";
  const target = isUsd ? "VNĐ" : "USD";
  const from = isUsd ? "$" : "VNĐ";
  const to = isUsd ? "VNĐ" : "$";

  return (
    <div className="flex items-end gap-3 flex-wrap p-2.5 rounded-lg border border-border bg-surface">
      <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
        Tỉ giá (VNĐ / 1 USD)
        <input
          value={rateText}
          disabled={readOnly}
          inputMode="decimal"
          placeholder="vd: 26000"
          aria-invalid={rateError != null}
          onChange={(e) => {
            const text = e.target.value;
            setRateText(text);
            const n = parseFxInput(text);
            if (text.trim() === "") onRateChange(null);
            else if (isValidFxRate(n)) onRateChange(n);
          }}
          className={`h-8 w-32 px-2 rounded-md border border-border bg-background text-xs tabular-nums disabled:opacity-60 ${rateError ? "border-red-400" : ""}`}
        />
      </label>

      {!readOnly && (
        <button
          type="button"
          disabled={rate == null}
          onClick={() => onConvert(direction)}
          className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          title={rate == null ? "Nhập tỉ giá trước" : `Đổi toàn bộ giá trong bảng sang ${target}`}
        >
          <ArrowLeftRight className="w-3.5 h-3.5" /> Đổi bảng: {from} → {to}
        </button>
      )}

      <p className={`text-[11px] ${rateError ? "text-red-600" : "text-muted-foreground"}`}>
        {rateError ?? (
          <>
            Bảng đang tính bằng <strong>{isUsd ? "USD" : "VNĐ"}</strong>. Đổi xong, kiểm tra rồi
            Publish để website cập nhật.
          </>
        )}
      </p>
    </div>
  );
}
