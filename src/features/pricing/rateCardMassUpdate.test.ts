// Pure tests for mass update. Run: bun test

import { describe, expect, test } from "bun:test";

import { applyRounding, computeMassUpdate, type MassUpdateSpec } from "./rateCardMassUpdate";
import type { RateCardRow } from "./rateCardTypes";

const rows: RateCardRow[] = [
  { kg: 0.5, price: 1000000 },
  { kg: 1, price: 2000000 },
  { kg: 1.5, price: "Liên hệ" },
  { kg: 2, price: 3000000 },
];

function spec(over: Partial<MassUpdateSpec> = {}): MassUpdateSpec {
  return {
    scope: { type: "all" },
    operation: { type: "increase_pct", value: 5 },
    rounding: "none",
    weightCol: "kg",
    priceCol: "price",
    ...over,
  };
}

describe("applyRounding", () => {
  test("none → integer", () => expect(applyRounding(1234.6, "none")).toBe(1235));
  test("nearest 1000", () => expect(applyRounding(1499, "nearest_1000")).toBe(1000));
  test("ceil 1000", () => expect(applyRounding(1001, "ceil_1000")).toBe(2000));
  test("floor 1000", () => expect(applyRounding(1999, "floor_1000")).toBe(1000));
  test("nearest 10000", () => expect(applyRounding(14999, "nearest_10000")).toBe(10000));
});

describe("computeMassUpdate — +5%", () => {
  const r = computeMassUpdate(rows, spec());
  test("numeric rows increased", () => {
    expect(r.rows[0].price).toBe(1050000);
    expect(r.rows[1].price).toBe(2100000);
    expect(r.rows[3].price).toBe(3150000);
  });
  test("non-numeric skipped & preserved", () => {
    expect(r.rows[2].price).toBe("Liên hệ");
    expect(r.preview.skippedRows).toBe(1);
  });
  test("affected count", () => expect(r.preview.affectedRows).toBe(3));
  test("preview min/max", () => {
    expect(r.preview.oldMin).toBe(1000000);
    expect(r.preview.oldMax).toBe(3000000);
    expect(r.preview.newMin).toBe(1050000);
    expect(r.preview.newMax).toBe(3150000);
  });
  test("largest change pct = 5", () => expect(r.preview.largestChangePct).toBe(5));
});

describe("+5% with nearest_1000 rounding", () => {
  const r = computeMassUpdate([{ kg: 1, price: 1387634 }], spec({ rounding: "nearest_1000" }));
  test("rounds after applying percent", () => expect(r.rows[0].price).toBe(1457000));
});

describe("scopes", () => {
  test("weight range only", () => {
    const r = computeMassUpdate(rows, spec({ scope: { type: "weight_range", from: 1, to: 1.5 } }));
    expect(r.rows[0].price).toBe(1000000); // 0.5 out of range
    expect(r.rows[1].price).toBe(2100000); // 1 in range
    expect(r.preview.affectedRows).toBe(1); // 1.5 is "Liên hệ" (skipped)
  });
  test("selected indices", () => {
    const r = computeMassUpdate(rows, spec({ scope: { type: "selected", indices: [3] } }));
    expect(r.rows[3].price).toBe(3150000);
    expect(r.rows[0].price).toBe(1000000);
    expect(r.preview.affectedRows).toBe(1);
  });
});

describe("operations", () => {
  test("multiply", () => {
    const r = computeMassUpdate(
      [{ kg: 1, price: 100 }],
      spec({ operation: { type: "multiply", value: 2 } }),
    );
    expect(r.rows[0].price).toBe(200);
  });
  test("add VND", () => {
    const r = computeMassUpdate(
      [{ kg: 1, price: 100 }],
      spec({ operation: { type: "add", value: 50 } }),
    );
    expect(r.rows[0].price).toBe(150);
  });
  test("round-only operation snaps", () => {
    const r = computeMassUpdate(
      [{ kg: 1, price: 1387634 }],
      spec({ operation: { type: "round" }, rounding: "nearest_10000" }),
    );
    expect(r.rows[0].price).toBe(1390000);
  });
});
