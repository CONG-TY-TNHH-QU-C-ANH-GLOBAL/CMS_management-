import { describe, expect, test } from "bun:test";

import {
  convertFx,
  formatFxResult,
  isValidFxRate,
  parseFxInput,
  readFxRate,
  withFxRate,
} from "./rateCardFx";

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

describe("formatFxResult", () => {
  test("USD keeps up to 4 dp, VND is whole", () => {
    expect(formatFxResult(5.8173, "vnd_to_usd")).toBe("$5.8173");
    expect(formatFxResult(254000.4, "usd_to_vnd")).toContain("254.000");
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
