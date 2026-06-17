// Currency/rate-aware semantic tests — regression for the TikTok decimal RATE
// bug (validator had assumed integer VND for every price column). Run: bun test

import { describe, expect, test } from "bun:test";

import {
  annotateSemantics,
  inferGridConfig,
  inferSemanticType,
  formatCellBySemantic,
  type RateCardColumn,
} from "./rateCardTypes";
import { normalizeCellBySemantic } from "./rateCardParse";
import { validateRateCard } from "./rateCardValidation";

function col(over: Partial<RateCardColumn>): RateCardColumn {
  return { code: "c", label: "C", position: 0, type: "currency", ...over };
}

describe("inferSemanticType", () => {
  test("Giá (VNĐ) → money_vnd", () =>
    expect(inferSemanticType(col({ code: "price", label: "Giá (VNĐ)" }), [1387634])).toBe(
      "money_vnd",
    ));
  test("RATE → rate_decimal", () =>
    expect(inferSemanticType(col({ code: "rate", label: "RATE" }), [4.03, 5.28])).toBe(
      "rate_decimal",
    ));
  test("$ / USD → money_usd", () => {
    expect(inferSemanticType(col({ code: "usd", label: "Giá ($)" }), [4.03])).toBe("money_usd");
    expect(inferSemanticType(col({ code: "p", label: "Price USD" }), [4.03])).toBe("money_usd");
  });
  test("Kg / Cân nặng → weight", () => {
    expect(inferSemanticType(col({ code: "kg", label: "Kg", type: "number" }), [0.5])).toBe(
      "weight",
    );
    expect(
      inferSemanticType(col({ code: "w", label: "Cân nặng (kg)", type: "number" }), [0.5]),
    ).toBe("weight");
  });
  test("explicit column.semantic wins", () =>
    expect(inferSemanticType(col({ semantic: "money_usd", label: "Giá (VNĐ)" }), [1])).toBe(
      "money_usd",
    ));
  test("explicit currency USD overrides label", () =>
    expect(inferSemanticType(col({ currency: "USD", label: "Giá (VNĐ)" }), [1])).toBe("money_usd"));
  test("text data (e.g. 20%) → text", () =>
    expect(inferSemanticType(col({ code: "vat", label: "VAT" }), ["20%", "21%"])).toBe("text"));
  test("all-numeric, no hint → number_decimal (not VND-integer)", () =>
    expect(inferSemanticType(col({ code: "x", label: "X" }), [4.03, 5.28])).toBe("number_decimal"));
});

describe("normalizeCellBySemantic — never turns decimal rate into integer", () => {
  test("rate 4,03 → 4.03", () =>
    expect(normalizeCellBySemantic("4,03", "rate_decimal")).toBe(4.03));
  test("rate 4.03 → 4.03", () =>
    expect(normalizeCellBySemantic("4.03", "rate_decimal")).toBe(4.03));
  test("rate 4,030 → 4.03 (decimal, not 4030)", () =>
    expect(normalizeCellBySemantic("4,030", "rate_decimal")).toBe(4.03));
  test("usd $4.03 → 4.03", () => expect(normalizeCellBySemantic("$4.03", "money_usd")).toBe(4.03));
  test("usd 4.03 USD → 4.03", () =>
    expect(normalizeCellBySemantic("4.03 USD", "money_usd")).toBe(4.03));
  test("usd 5,28 → 5.28", () => expect(normalizeCellBySemantic("5,28", "money_usd")).toBe(5.28));
  test("vnd 1.387.634 → 1387634", () =>
    expect(normalizeCellBySemantic("1.387.634", "money_vnd")).toBe(1387634));
  test("vnd 1,387,634 → 1387634", () =>
    expect(normalizeCellBySemantic("1,387,634", "money_vnd")).toBe(1387634));
  test("vnd 1387634 VNĐ → 1387634", () =>
    expect(normalizeCellBySemantic("1387634 VNĐ", "money_vnd")).toBe(1387634));
  test("vnd 4,03 → 4 (rounded int, NEVER 403, never decimal money)", () =>
    expect(normalizeCellBySemantic("4,03", "money_vnd")).toBe(4));
  test("usd 4,03 → 4.03 (decimal comma, not 403, not VNĐ)", () =>
    expect(normalizeCellBySemantic("4,03", "money_usd")).toBe(4.03));
  test("weight 0,5 → 0.5", () => expect(normalizeCellBySemantic("0,5", "weight")).toBe(0.5));
  test("weight 0.5 → 0.5", () => expect(normalizeCellBySemantic("0.5", "weight")).toBe(0.5));
  test("text kept verbatim", () =>
    expect(normalizeCellBySemantic("Liên hệ", "text")).toBe("Liên hệ"));
});

const TIKTOK_COLS: RateCardColumn[] = [
  { code: "kg", label: "Kg", position: 0, type: "number" },
  { code: "rate", label: "RATE", position: 1, type: "currency" },
];
const TIKTOK_ROWS = [
  { kg: 0.2, rate: 4.03 },
  { kg: 0.3, rate: 5.28 },
  { kg: 0.4, rate: 6.53 },
];

describe("validation — currency-aware (TikTok regression)", () => {
  test("decimal RATE table has ZERO critical errors", () => {
    const cfg = inferGridConfig(TIKTOK_COLS, TIKTOK_ROWS);
    const res = validateRateCard(TIKTOK_ROWS, cfg, {
      strictNumericCols: new Set(["kg", "rate"]),
    });
    expect(res.criticalCount).toBe(0);
    expect(res.issues.some((i) => i.code === "price_not_integer")).toBe(false);
  });

  test("rate column resolves to rate_decimal in config", () => {
    const cfg = inferGridConfig(TIKTOK_COLS, TIKTOK_ROWS);
    expect(cfg.semanticByCol.rate).toBe("rate_decimal");
    expect(cfg.priceCols).toEqual(["rate"]);
    expect(cfg.weightCol).toBe("kg");
  });

  test("VND table still enforces integer", () => {
    const cols: RateCardColumn[] = [
      { code: "kg", label: "Cân nặng (kg)", position: 0, type: "number" },
      { code: "price", label: "Giá (VNĐ)", position: 1, type: "currency" },
    ];
    const rows = [{ kg: 0.5, price: 1387634.5 }]; // non-integer VND
    const cfg = inferGridConfig(cols, rows, { currency: "VND" });
    const res = validateRateCard(rows, cfg, { strictNumericCols: new Set(["price"]) });
    expect(res.issues.some((i) => i.code === "price_not_integer")).toBe(true);
  });

  test("abc in RATE column is critical (strict numeric)", () => {
    const rows = [{ kg: 0.2, rate: "abc" }];
    const cfg = inferGridConfig(TIKTOK_COLS, TIKTOK_ROWS);
    const res = validateRateCard(rows, cfg, { strictNumericCols: new Set(["rate"]) });
    expect(res.issues.find((i) => i.code === "price_non_numeric")?.severity).toBe("critical");
  });

  test("negative RATE is critical, empty RATE is critical", () => {
    const cfg = inferGridConfig(TIKTOK_COLS, TIKTOK_ROWS);
    const res = validateRateCard(
      [
        { kg: 0.2, rate: -1 },
        { kg: 0.3, rate: "" },
      ],
      cfg,
      {
        strictNumericCols: new Set(["rate"]),
      },
    );
    expect(res.issues.some((i) => i.code === "price_negative")).toBe(true);
    expect(res.issues.some((i) => i.code === "price_empty")).toBe(true);
  });

  test("text/percent columns are lenient (euRate VAT '20%' not critical)", () => {
    const cols: RateCardColumn[] = [
      { code: "country", label: "COUNTRY", position: 0, type: "currency" },
      { code: "vat", label: "VAT", position: 1, type: "currency" },
    ];
    const rows = [
      { country: "Austria", vat: "20%" },
      { country: "Belgium", vat: "21%" },
    ];
    const cfg = inferGridConfig(cols, rows);
    expect(cfg.semanticByCol.vat).toBe("text");
    const res = validateRateCard(rows, cfg);
    expect(res.criticalCount).toBe(0);
  });
});

describe("formatCellBySemantic (display only)", () => {
  test("vnd grouped no decimals", () =>
    expect(formatCellBySemantic(1387634, "money_vnd")).toBe("1.387.634"));
  test("usd prefixes $", () => expect(formatCellBySemantic(4.03, "money_usd")).toBe("$4.03"));
  test("rate decimal preserved", () =>
    expect(formatCellBySemantic(4.03, "rate_decimal")).toBe("4.03"));
  test("non-numeric shown raw", () =>
    expect(formatCellBySemantic("Liên hệ", "money_vnd")).toBe("Liên hệ"));
});

describe("annotateSemantics", () => {
  test("annotates every column", () => {
    const out = annotateSemantics(TIKTOK_COLS, TIKTOK_ROWS);
    expect(out.map((c) => c.semantic)).toEqual(["weight", "rate_decimal"]);
  });
});
