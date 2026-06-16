// Pure tests for the formula generator. Run: bun test

import { describe, expect, test } from "bun:test";

import {
  applyFormula,
  generateFormulaRows,
  priceForWeight,
  roundTo,
  validateFormulaSpec,
  type FormulaSpec,
} from "./rateCardFormula";
import type { RateCardColumn } from "./rateCardTypes";

const COLS: RateCardColumn[] = [
  { code: "kg", label: "Cân nặng", position: 0, type: "number" },
  { code: "price", label: "Giá", position: 1, type: "currency" },
];

function spec(over: Partial<FormulaSpec> = {}): FormulaSpec {
  return {
    startWeight: 0.5,
    endWeight: 20,
    step: 0.5,
    basePrice: 1000000,
    incrementPerStep: 200000,
    rounding: 0,
    weightCol: "kg",
    priceCol: "price",
    applyMode: "replace_all",
    ...over,
  };
}

describe("roundTo", () => {
  test("none = integer round", () => expect(roundTo(1234.6, 0)).toBe(1235));
  test("nearest 1000", () => expect(roundTo(1234, 1000)).toBe(1000));
  test("nearest 10000", () => expect(roundTo(15001, 10000)).toBe(20000));
  test("nearest 100000", () => expect(roundTo(149999, 100000)).toBe(100000));
});

describe("generateFormulaRows — 0.5 → 20 step 0.5", () => {
  const rows = generateFormulaRows(spec());
  test("count is 40 rows (0.5..20 inclusive)", () => expect(rows).toHaveLength(40));
  test("first row", () => expect(rows[0]).toEqual({ kg: 0.5, price: 1000000 }));
  test("second row applies increment", () => expect(rows[1]).toEqual({ kg: 1, price: 1200000 }));
  test("last row weight is exactly 20 (no float drift)", () => expect(rows[39].kg).toBe(20));
  test("last row price", () => expect(rows[39].price).toBe(1000000 + 200000 * 39));
});

describe("rounding inside generation", () => {
  test("snaps to nearest 10000", () => {
    const rows = generateFormulaRows(
      spec({ basePrice: 1003500, incrementPerStep: 0, rounding: 10000, endWeight: 0.5 }),
    );
    expect(rows[0].price).toBe(1000000);
  });
});

describe("priceForWeight", () => {
  const s = spec();
  test("on-step weight", () => expect(priceForWeight(s, 1)).toBe(1200000));
  test("off-step weight → null", () => expect(priceForWeight(s, 0.7)).toBeNull());
  test("out of range → null", () => expect(priceForWeight(s, 25)).toBeNull());
});

describe("applyFormula modes", () => {
  test("replace_all returns generated rows", () => {
    const r = applyFormula([{ kg: 99, price: 5 }], COLS, spec({ endWeight: 1 }));
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toEqual({ kg: 0.5, price: 1000000 });
  });

  test("fill_empty only fills empty price cells", () => {
    const rows = [
      { kg: 0.5, price: 777 }, // not empty → untouched
      { kg: 1, price: "" }, // empty → filled
      { kg: 1.5, price: "" }, // empty → filled
    ];
    const r = applyFormula(rows, COLS, spec({ applyMode: "fill_empty" }));
    expect(r.rows[0].price).toBe(777);
    expect(r.rows[1].price).toBe(1200000);
    expect(r.rows[2].price).toBe(1400000);
    expect(r.affected).toBe(2);
  });

  test("selected_range only touches selected rows", () => {
    const rows = [
      { kg: 0.5, price: 1 },
      { kg: 1, price: 2 },
      { kg: 1.5, price: 3 },
    ];
    const r = applyFormula(rows, COLS, spec({ applyMode: "selected_range" }), [1]);
    expect(r.rows[0].price).toBe(1);
    expect(r.rows[1].price).toBe(1200000);
    expect(r.rows[2].price).toBe(3);
  });
});

describe("validateFormulaSpec", () => {
  test("ok", () => expect(validateFormulaSpec(spec())).toBeNull());
  test("step <= 0", () => expect(validateFormulaSpec(spec({ step: 0 }))).toContain("Bước nhảy"));
  test("end < start", () =>
    expect(validateFormulaSpec(spec({ endWeight: 0 }))).toContain("kết thúc"));
});
