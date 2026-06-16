// Pure tests for clipboard parsing + number normalization. Run: bun test

import { describe, expect, test } from "bun:test";

import {
  applyPaste,
  detectDelimiter,
  normalizeCell,
  normalizeCurrency,
  parseClipboardMatrix,
  parseLocaleNumber,
} from "./rateCardParse";
import type { RateCardColumn, RateCardRow } from "./rateCardTypes";

const COLS: RateCardColumn[] = [
  { code: "kg", label: "Cân nặng", position: 0, type: "number" },
  { code: "price", label: "Giá (VNĐ)", position: 1, type: "currency" },
];

describe("parseLocaleNumber — VND formats", () => {
  test("plain integer", () => expect(parseLocaleNumber("1387634")).toBe(1387634));
  test("comma thousands", () => expect(parseLocaleNumber("1,387,634")).toBe(1387634));
  test("dot thousands (VN)", () => expect(parseLocaleNumber("1.387.634")).toBe(1387634));
  test("currency suffix stripped", () => expect(parseLocaleNumber("1387634 VNĐ")).toBe(1387634));
  test("dong glyph + dot thousands", () => expect(parseLocaleNumber("₫1.589.754")).toBe(1589754));
  test("decimal weight dot", () => expect(parseLocaleNumber("0.5")).toBe(0.5));
  test("decimal weight comma", () => expect(parseLocaleNumber("1,5")).toBe(1.5));
  test("mixed comma-thousand dot-decimal", () =>
    expect(parseLocaleNumber("1,234.56")).toBe(1234.56));
  test("mixed dot-thousand comma-decimal (EU)", () =>
    expect(parseLocaleNumber("1.234,56")).toBe(1234.56));
  test("single comma 3 digits → thousands", () => expect(parseLocaleNumber("1,234")).toBe(1234));
  test("single dot 3 digits → thousands", () => expect(parseLocaleNumber("1.387")).toBe(1387));
  test("preferDecimal: 3 trailing digits → decimal", () =>
    expect(parseLocaleNumber("1.500", true)).toBe(1.5));
  test("preferDecimal: comma decimal", () => expect(parseLocaleNumber("12,5", true)).toBe(12.5));
  test("preferDecimal: multi-sep still thousands", () =>
    expect(parseLocaleNumber("1.387.634", true)).toBe(1387634));
  test("negative", () => expect(parseLocaleNumber("-1,000")).toBe(-1000));
  test("empty → null", () => expect(parseLocaleNumber("")).toBeNull());
  test("non-numeric → null", () => expect(parseLocaleNumber("Liên hệ")).toBeNull());
  test("already number passthrough", () => expect(parseLocaleNumber(42)).toBe(42));
});

describe("normalizeCurrency — integer VND", () => {
  test("rounds decimal", () => expect(normalizeCurrency("1234.56")).toBe(1235));
  test("grouped", () => expect(normalizeCurrency("2,006,485")).toBe(2006485));
  test("null on garbage", () => expect(normalizeCurrency("abc")).toBeNull());
});

describe("normalizeCell — keeps legit non-numeric strings", () => {
  test("currency numeric → number", () =>
    expect(normalizeCell("1.387.634", "currency")).toBe(1387634));
  test("currency 'Liên hệ' kept as string", () =>
    expect(normalizeCell("Liên hệ", "currency")).toBe("Liên hệ"));
  test("number bracket kept as string", () =>
    expect(normalizeCell("21-30", "number")).toBe("21-30"));
  test("weight '1.500' → 1.5 (decimal, not thousands)", () =>
    expect(normalizeCell("1.500", "number")).toBe(1.5));
  test("weight '0,5' → 0.5 (comma decimal)", () =>
    expect(normalizeCell("0,5", "number")).toBe(0.5));
  test("weight '0.5' → 0.5", () => expect(normalizeCell("0.5", "number")).toBe(0.5));
  test("currency '1.500' → 1500 (thousands)", () =>
    expect(normalizeCell("1.500", "currency")).toBe(1500));
  test("empty stays empty", () => expect(normalizeCell("  ", "currency")).toBe(""));
});

describe("detectDelimiter", () => {
  test("tab", () => expect(detectDelimiter("0.5\t1387634")).toBe("\t"));
  test("whitespace", () => expect(detectDelimiter("0.5    1387634")).toBe("ws"));
  test("single grouped number is not CSV", () => expect(detectDelimiter("1,387,634")).toBe("ws"));
  test("single decimal-comma number is not CSV", () => expect(detectDelimiter("12,5")).toBe("ws"));
  test("real csv", () => expect(detectDelimiter("a,b,c")).toBe(","));
});

describe("parseClipboardMatrix", () => {
  test("TSV 2 cols x many rows", () => {
    const text = "0.5\t1387634\n1\t1589754\n1.5\t1799994";
    expect(parseClipboardMatrix(text)).toEqual([
      ["0.5", "1387634"],
      ["1", "1589754"],
      ["1.5", "1799994"],
    ]);
  });
  test("whitespace separated", () => {
    expect(parseClipboardMatrix("0.5    1387634\n1   1589754")).toEqual([
      ["0.5", "1387634"],
      ["1", "1589754"],
    ]);
  });
  test("trailing newline dropped, blank lines skipped", () => {
    expect(parseClipboardMatrix("0.5\t1\n\n1\t2\n")).toEqual([
      ["0.5", "1"],
      ["1", "2"],
    ]);
  });
  test("quoted csv with comma inside", () => {
    expect(parseClipboardMatrix('a,"x,y",c')).toEqual([["a", "x,y", "c"]]);
  });
});

describe("applyPaste", () => {
  const base: RateCardRow[] = [
    { kg: 0.5, price: 1 },
    { kg: 1, price: 2 },
  ];

  test("maps from focused cell, normalizes, counts cells", () => {
    const matrix = [
      ["0.5", "1.387.634"],
      ["1", "1,589,754"],
    ];
    const r = applyPaste(base, COLS, 0, 0, matrix);
    expect(r.rows[0]).toEqual({ kg: 0.5, price: 1387634 });
    expect(r.rows[1]).toEqual({ kg: 1, price: 1589754 });
    expect(r.cellsUpdated).toBe(2); // only the two price cells change; weights match existing
    expect(r.changedCells).toContain("0:price");
    expect(r.changedCells).toContain("1:price");
  });

  test("auto-expands rows when paste is taller", () => {
    const matrix = [
      ["0.5", "1"],
      ["1", "2"],
      ["1.5", "3"],
      ["2", "4"],
    ];
    const r = applyPaste(base, COLS, 0, 0, matrix);
    expect(r.rows).toHaveLength(4);
    expect(r.rowsAdded).toBe(2);
    expect(r.rows[3]).toEqual({ kg: 2, price: 4 });
  });

  test("anchored at non-zero start col", () => {
    const matrix = [["999"]];
    const r = applyPaste(base, COLS, 1, 1, matrix);
    expect(r.rows[1].price).toBe(999);
    expect(r.changedCells).toEqual(["1:price"]);
  });

  test("notes when extra columns dropped", () => {
    const matrix = [["0.5", "1", "EXTRA"]];
    const r = applyPaste(base, COLS, 0, 0, matrix);
    expect(r.notes.join(" ")).toContain("cột thừa");
  });

  test("empty clipboard → note, no change", () => {
    const r = applyPaste(base, COLS, 0, 0, []);
    expect(r.cellsUpdated).toBe(0);
    expect(r.notes.length).toBe(1);
  });
});
