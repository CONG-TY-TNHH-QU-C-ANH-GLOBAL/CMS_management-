// XLSX import test — builds a real .xlsx in memory and parses it back through
// the same path the dialog uses. Run: bun test

import { describe, expect, test } from "bun:test";
import * as XLSX from "xlsx";

import { parseXlsxImport } from "./rateCardCsv";
import { annotateSemantics, type RateCardColumn } from "./rateCardTypes";

const COLS: RateCardColumn[] = annotateSemantics(
  [
    { code: "kg", label: "Kg", position: 0, type: "number" },
    { code: "rate", label: "RATE", position: 1, type: "currency" },
  ],
  [{ kg: 0.2, rate: 4.03 }], // sample so rate resolves to rate_decimal
);

function xlsxBuffer(aoa: (string | number)[][]): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("parseXlsxImport", () => {
  test("first sheet, header Kg/RATE, numeric decimals preserved", async () => {
    const buf = xlsxBuffer([
      ["Kg", "RATE"],
      [0.2, 4.03],
      [0.3, 5.28],
    ]);
    const r = await parseXlsxImport(buf, COLS);
    expect(r.hasHeader).toBe(true);
    expect(r.rows).toEqual([
      { kg: 0.2, rate: 4.03 },
      { kg: 0.3, rate: 5.28 },
    ]);
    expect(r.notes.some((n) => /sheet đầu tiên/i.test(n))).toBe(true);
  });

  test("decimal-comma strings parse as decimals (rate semantic), not thousands", async () => {
    const buf = xlsxBuffer([
      ["Kg", "RATE"],
      ["0,5", "4,03"],
    ]);
    const r = await parseXlsxImport(buf, COLS);
    expect(r.rows[0]).toEqual({ kg: 0.5, rate: 4.03 });
  });
});
