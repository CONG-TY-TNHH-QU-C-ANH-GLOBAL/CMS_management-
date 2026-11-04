import { describe, expect, test } from "bun:test";

import {
  convertFx,
  convertGridCurrency,
  isValidFxRate,
  parseFxInput,
  readFxRate,
  withFxRate,
} from "./rateCardFx";
import { inferGridConfig, type RateCardColumn } from "./rateCardTypes";

describe("parseFxInput", () => {
  test("accepts vi and en grouping and decimals", () => {
    expect(parseFxInput("25400")).toBe(25400);
    expect(parseFxInput("25.400")).toBe(25400);
    expect(parseFxInput("25,400")).toBe(25400);
    expect(parseFxInput("25,400.5")).toBe(25400.5);
    expect(parseFxInput("25400,5")).toBe(25400.5);
  });
  test("empty / garbage → null", () => {
    expect(parseFxInput("")).toBeNull();
    expect(parseFxInput("abc")).toBeNull();
  });
});

describe("isValidFxRate", () => {
  test("rejects a typo'd rate that would misquote prices", () => {
    expect(isValidFxRate(25.4)).toBe(false);
    expect(isValidFxRate(0)).toBe(false);
    expect(isValidFxRate(NaN)).toBe(false);
    expect(isValidFxRate("25400")).toBe(false);
    expect(isValidFxRate(25400)).toBe(true);
  });
});

describe("readFxRate", () => {
  test("reads valid, ignores absent/invalid/non-object", () => {
    expect(readFxRate({ fx_rate: 25400 })).toBe(25400);
    expect(readFxRate({ fx_rate: 5 })).toBeNull();
    expect(readFxRate({})).toBeNull();
    expect(readFxRate(null)).toBeNull();
    expect(readFxRate([])).toBeNull();
  });
});

describe("convertFx", () => {
  test("VND → USD and back", () => {
    expect(convertFx(254000, "vnd_to_usd", 25400)).toBe(10);
    expect(convertFx(10, "usd_to_vnd", 25400)).toBe(254000);
  });
  test("null without a usable rate", () => {
    expect(convertFx(1000, "vnd_to_usd", null)).toBeNull();
    expect(convertFx(1000, "vnd_to_usd", 3)).toBeNull();
    expect(convertFx(NaN, "vnd_to_usd", 25400)).toBeNull();
  });
});

describe("withFxRate", () => {
  test("sets, replaces, and removes without mutating or dropping other keys", () => {
    const base = { type: "weight_grid", step: 0.05 };
    expect(withFxRate(base, 25400)).toEqual({ type: "weight_grid", step: 0.05, fx_rate: 25400 });
    expect(withFxRate({ ...base, fx_rate: 1 }, 26000).fx_rate).toBe(26000);
    expect(withFxRate({ ...base, fx_rate: 25400 }, null)).toEqual(base);
    expect(base).toEqual({ type: "weight_grid", step: 0.05 });
  });
});

describe("convertGridCurrency", () => {
  const cols: RateCardColumn[] = [
    { code: "kg", label: "Kg", position: 0, type: "number" },
    { code: "us", label: "US", position: 1, type: "currency", semantic: "money_vnd" },
    { code: "uk", label: "UK", position: 2, type: "currency", semantic: "money_vnd" },
  ];
  const rows = [
    { kg: 0.05, us: 147758, uk: "Liên hệ" },
    { kg: 0.1, us: "153338", uk: 107136 },
  ];
  const config = inferGridConfig(cols, rows, { currency: "VND" });

  test("VND → USD converts every money cell, rounds to cents, keeps kg and text", () => {
    const r = convertGridCurrency(rows, cols, config, 26000, "vnd_to_usd")!;
    expect(r.rows).toEqual([
      { kg: 0.05, us: 5.68, uk: "Liên hệ" },
      { kg: 0.1, us: 5.9, uk: 4.12 },
    ]);
    expect(r.converted).toBe(3);
    expect(r.changedCells).toEqual(["0:us", "1:us", "1:uk"]);
    expect(r.currency).toBe("USD");
    expect(r.cols.find((c) => c.code === "us")).toMatchObject({
      semantic: "money_usd",
      currency: "USD",
    });
    expect(r.cols.find((c) => c.code === "kg")?.semantic).toBeUndefined();
  });

  test("USD → VND rounds to whole đồng", () => {
    const usd = convertGridCurrency(rows, cols, config, 26000, "vnd_to_usd")!;
    const back = convertGridCurrency(
      usd.rows,
      usd.cols,
      inferGridConfig(usd.cols, usd.rows, { currency: "USD" }),
      26000,
      "usd_to_vnd",
    )!;
    expect(back.rows[0].us).toBe(147680);
    expect(back.currency).toBe("VND");
  });

  test("does not touch columns already in the target currency, and needs a valid rate", () => {
    expect(convertGridCurrency(rows, cols, config, 26000, "usd_to_vnd")!.converted).toBe(0);
    expect(convertGridCurrency(rows, cols, config, 26, "vnd_to_usd")).toBeNull();
    expect(convertGridCurrency(rows, cols, config, null, "vnd_to_usd")).toBeNull();
  });

  test("never mutates its input", () => {
    convertGridCurrency(rows, cols, config, 26000, "vnd_to_usd");
    expect(rows[0].us).toBe(147758);
    expect(cols[1].semantic).toBe("money_vnd");
  });
});
