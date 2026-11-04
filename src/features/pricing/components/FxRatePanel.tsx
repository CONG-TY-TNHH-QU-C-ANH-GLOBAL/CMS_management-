// Rate Card Builder — exchange-rate field + one-off VND ⇄ USD converter.
//
// Presentational: the rate itself is owned by useRateCardEditor (so it is part
// of the draft/publish cycle); the converter is local scratch state and never
// touches the table.

import { ArrowLeftRight } from "lucide-react";
import { useState } from "react";

import {
  convertFx,
  formatFxResult,
  isValidFxRate,
  parseFxInput,
  type FxDirection,
} from "../rateCardFx";

interface Props {
  rate: number | null;
  onRateChange: (rate: number | null) => void;
  readOnly: boolean;
}

const inputCls =
  "h-8 px-2 rounded-md border border-border bg-background text-xs tabular-nums disabled:opacity-60";

export function FxRatePanel({ rate, onRateChange, readOnly }: Props) {
  // Keep the raw text so half-typed input ("25.") isn't rewritten under the cursor.
  const [rateText, setRateText] = useState(rate != null ? String(rate) : "");
  const [direction, setDirection] = useState<FxDirection>("vnd_to_usd");
  const [amountText, setAmountText] = useState("");

  const typed = parseFxInput(rateText);
  const rateError =
    rateText.trim() !== "" && !isValidFxRate(typed)
      ? "Tỉ giá phải từ 1.000 đến 1.000.000 VNĐ/USD"
      : null;

  const amount = parseFxInput(amountText);
  const result = amount != null ? convertFx(amount, direction, rate) : null;
  const fromUnit = direction === "vnd_to_usd" ? "VNĐ" : "USD";

  return (
    <div className="flex items-end gap-4 flex-wrap p-2.5 rounded-lg border border-border bg-surface">
      <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
        Tỉ giá (VNĐ / 1 USD)
        <input
          value={rateText}
          disabled={readOnly}
          inputMode="decimal"
          placeholder="vd: 25400"
          aria-invalid={rateError != null}
          onChange={(e) => {
            const text = e.target.value;
            setRateText(text);
            const n = parseFxInput(text);
            if (text.trim() === "") onRateChange(null);
            else if (isValidFxRate(n)) onRateChange(n);
          }}
          className={`${inputCls} w-32 ${rateError ? "border-red-400" : ""}`}
        />
      </label>

      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          Quy đổi ({fromUnit})
          <input
            value={amountText}
            inputMode="decimal"
            placeholder={direction === "vnd_to_usd" ? "vd: 147758" : "vd: 5.8"}
            onChange={(e) => setAmountText(e.target.value)}
            className={`${inputCls} w-32`}
          />
        </label>
        <button
          type="button"
          onClick={() => setDirection((d) => (d === "vnd_to_usd" ? "usd_to_vnd" : "vnd_to_usd"))}
          className="h-8 px-2 inline-flex items-center gap-1 rounded-md border border-border bg-background text-xs hover:bg-surface-muted"
          title="Đổi chiều quy đổi"
        >
          <ArrowLeftRight className="w-3.5 h-3.5" />
          {direction === "vnd_to_usd" ? "VNĐ → USD" : "USD → VNĐ"}
        </button>
        <div
          className="h-8 min-w-24 px-2 inline-flex items-center rounded-md bg-muted/40 text-xs font-semibold tabular-nums"
          aria-live="polite"
        >
          {result != null ? formatFxResult(result, direction) : "—"}
        </div>
      </div>

      <p className={`text-[11px] ${rateError ? "text-red-600" : "text-muted-foreground"} max-w-xs`}>
        {rateError ??
          (rate == null
            ? "Chưa có tỉ giá — website sẽ chưa hiện nút đổi USD/VNĐ cho bảng này."
            : "Lưu cùng bảng giá khi Publish; website dùng tỉ giá này để đổi VNĐ ⇄ USD.")}
      </p>
    </div>
  );
}
