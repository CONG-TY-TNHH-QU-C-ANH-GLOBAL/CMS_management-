// Pure tests for validation. Run: bun test

import { describe, expect, test } from "bun:test";

import { validateRateCard } from "./rateCardValidation";
import { inferGridConfig, type RateCardColumn, type RateCardRow } from "./rateCardTypes";

const COLS: RateCardColumn[] = [
  { code: "kg", label: "Cân nặng", position: 0, type: "number" },
  { code: "price", label: "Giá", position: 1, type: "currency" },
];

function cfg(rows: RateCardRow[], step?: number) {
  return inferGridConfig(COLS, rows, step ? { step } : undefined);
}

function codes(rows: RateCardRow[], step?: number) {
  return validateRateCard(rows, cfg(rows, step)).issues.map((i) => i.code);
}

describe("critical errors", () => {
  test("empty weight", () => {
    expect(codes([{ kg: "", price: 100 }])).toContain("weight_empty");
  });
  test("empty price", () => {
    expect(codes([{ kg: 1, price: "" }])).toContain("price_empty");
  });
  test("negative price", () => {
    expect(codes([{ kg: 1, price: -5 }])).toContain("price_negative");
  });
  test("non-integer price", () => {
    expect(codes([{ kg: 1, price: 100.5 }])).toContain("price_not_integer");
  });
  test("weight not positive", () => {
    expect(codes([{ kg: 0, price: 100 }])).toContain("weight_not_positive");
  });
  test("duplicate weight (numeric vs string equal)", () => {
    const c = codes([
      { kg: 1, price: 100 },
      { kg: "1", price: 200 },
    ]);
    expect(c).toContain("duplicate_weight");
  });
});

describe("warnings (publish still allowed)", () => {
  test("non-numeric price 'Liên hệ' is warning not critical", () => {
    const res = validateRateCard([{ kg: 1, price: "Liên hệ" }], cfg([{ kg: 1, price: "Liên hệ" }]));
    expect(res.issues.some((i) => i.code === "price_non_numeric")).toBe(true);
    expect(res.criticalCount).toBe(0);
  });
  test("bracket weight is warning not critical", () => {
    const res = validateRateCard([{ kg: "21-30", price: 100 }], cfg([{ kg: "21-30", price: 100 }]));
    expect(res.issues.some((i) => i.code === "weight_non_numeric")).toBe(true);
    expect(res.criticalCount).toBe(0);
  });
  test("non-monotonic weight", () => {
    expect(
      codes([
        { kg: 2, price: 100 },
        { kg: 1, price: 200 },
      ]),
    ).toContain("weight_not_increasing");
  });
  test("missing step", () => {
    // step 0.5 declared; jump from 1 to 2.5 skips mocs
    expect(
      codes(
        [
          { kg: 1, price: 100 },
          { kg: 2.5, price: 200 },
        ],
        0.5,
      ),
    ).toContain("missing_weight_step");
  });
  test("abnormal price jump > 30%", () => {
    expect(
      codes([
        { kg: 1, price: 100 },
        { kg: 2, price: 200 },
      ]),
    ).toContain("abnormal_price_jump");
  });
  test("normal price jump < 30% does not warn", () => {
    expect(
      codes([
        { kg: 1, price: 100 },
        { kg: 2, price: 110 },
      ]),
    ).not.toContain("abnormal_price_jump");
  });
});

describe("strict-numeric mode (escalates non-numeric → critical)", () => {
  test("price col marked strict: 'Liên hệ' becomes critical", () => {
    const rows = [{ kg: 1, price: "Liên hệ" }];
    const res = validateRateCard(rows, cfg(rows), { strictNumericCols: new Set(["price"]) });
    const issue = res.issues.find((i) => i.code === "price_non_numeric");
    expect(issue?.severity).toBe("critical");
    expect(res.criticalCount).toBeGreaterThan(0);
  });
  test("price col NOT strict: 'Liên hệ' stays warning", () => {
    const rows = [{ kg: 1, price: "Liên hệ" }];
    const res = validateRateCard(rows, cfg(rows), { strictNumericCols: new Set() });
    expect(res.issues.find((i) => i.code === "price_non_numeric")?.severity).toBe("warning");
    expect(res.criticalCount).toBe(0);
  });
  test("strict weight col: bracket becomes critical", () => {
    const rows = [{ kg: "21-30", price: 100 }];
    const res = validateRateCard(rows, cfg(rows), { strictNumericCols: new Set(["kg"]) });
    expect(res.issues.find((i) => i.code === "weight_non_numeric")?.severity).toBe("critical");
  });
});

describe("counts and maps", () => {
  test("clean table has zero issues", () => {
    const rows = [
      { kg: 0.5, price: 1000 },
      { kg: 1, price: 1100 },
      { kg: 1.5, price: 1200 },
    ];
    const res = validateRateCard(rows, cfg(rows, 0.5));
    expect(res.criticalCount).toBe(0);
    expect(res.warningCount).toBe(0);
  });
  test("cellIssues keyed by row:col", () => {
    const rows = [{ kg: 1, price: "" }];
    const res = validateRateCard(rows, cfg(rows));
    expect(res.cellIssues.has("0:price")).toBe(true);
  });
  test("row count mismatch warning when expected provided", () => {
    const rows = [{ kg: 1, price: 100 }];
    const res = validateRateCard(rows, cfg(rows), { expectedRowCount: 46 });
    expect(res.issues.some((i) => i.code === "row_count_mismatch")).toBe(true);
  });
});
