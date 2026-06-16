// Pure-function tests for the editor hook's exported helpers (no React).
// Run: bun test

import { describe, expect, test } from "bun:test";

import {
  denormalizeWeightGrid,
  inferStrictNumericCols,
  normalizeWeightGrid,
  type GridRow,
} from "./useRateCardEditor";
import type { RateCardColumn } from "./rateCardTypes";

const COLS: RateCardColumn[] = [
  { code: "kg", label: "Cân nặng", position: 0, type: "number" },
  { code: "price", label: "Giá", position: 1, type: "currency" },
];

describe("inferStrictNumericCols", () => {
  test("all-numeric column is strict", () => {
    const s = inferStrictNumericCols(
      [
        { kg: 1, price: 1000 },
        { kg: 2, price: 2000 },
      ],
      COLS,
    );
    expect(s.has("kg")).toBe(true);
    expect(s.has("price")).toBe(true);
  });
  test("column with legit text is NOT strict", () => {
    const s = inferStrictNumericCols(
      [
        { kg: 1, price: "Liên hệ" },
        { kg: 2, price: 2000 },
      ],
      COLS,
    );
    expect(s.has("price")).toBe(false); // has text → lenient
    expect(s.has("kg")).toBe(true);
  });
  test("empty column defaults to strict", () => {
    const s = inferStrictNumericCols([{ kg: "", price: "" }], COLS);
    expect(s.has("price")).toBe(true);
  });
});

describe("denormalizeWeightGrid", () => {
  test("drops empty cells, coerces numeric strings, keeps text", () => {
    const rows: GridRow[] = [
      { __id: "a", kg: 0.5, price: "1.387.634" }, // string slipped through
      { __id: "b", kg: 1, price: "Liên hệ" },
      { __id: "c", kg: 1.5, price: "" }, // empty dropped
    ];
    expect(denormalizeWeightGrid(rows, COLS)).toEqual([
      { kg: 0.5, price: 1387634 },
      { kg: 1, price: "Liên hệ" },
      { kg: 1.5 },
    ]);
  });

  test("preserves extra row fields not in column list", () => {
    const rows: GridRow[] = [{ __id: "a", kg: 1, price: 1000, note: "x" }];
    // 'note' has no column → passed through verbatim (not lost).
    expect(denormalizeWeightGrid(rows, COLS)[0]).toEqual({ kg: 1, price: 1000, note: "x" });
  });
});

describe("normalizeWeightGrid round-trip shape", () => {
  test("rebuilds rows + cols from data, assigns ids", () => {
    const { rows, cols } = normalizeWeightGrid([{ kg: 0.5, price: 1000 }], COLS);
    expect(cols.map((c) => c.code)).toEqual(["kg", "price"]);
    expect(rows[0].kg).toBe(0.5);
    expect(typeof rows[0].__id).toBe("string");
  });
});
