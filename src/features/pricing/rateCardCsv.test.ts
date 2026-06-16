// Pure tests for CSV import/export. Run: bun test

import { describe, expect, test } from "bun:test";

import { exportCsv, parseCsvImport, sanitizeCsvCell } from "./rateCardCsv";
import type { RateCardColumn, RateCardRow } from "./rateCardTypes";

const COLS: RateCardColumn[] = [
  { code: "kg", label: "Cân nặng", position: 0, type: "number" },
  { code: "price", label: "Giá (VNĐ)", position: 1, type: "currency" },
];

describe("exportCsv", () => {
  test("header from labels + rows", () => {
    const rows: RateCardRow[] = [
      { kg: 0.5, price: 1387634 },
      { kg: 1, price: 1589754 },
    ];
    const csv = exportCsv(rows, COLS);
    expect(csv).toBe("Cân nặng,Giá (VNĐ)\r\n0.5,1387634\r\n1,1589754");
  });
  test("escapes commas/quotes", () => {
    const csv = exportCsv([{ kg: 1, price: "a,b" }], COLS);
    expect(csv).toContain('"a,b"');
  });
});

describe("parseCsvImport", () => {
  test("with header by label, normalizes values", () => {
    const csv = 'Cân nặng,Giá (VNĐ)\n0.5,"1.387.634"\n1,1589754';
    const r = parseCsvImport(csv, COLS);
    expect(r.hasHeader).toBe(true);
    expect(r.rows).toEqual([
      { kg: 0.5, price: 1387634 },
      { kg: 1, price: 1589754 },
    ]);
  });

  test("with header by code", () => {
    const r = parseCsvImport("kg,price\n2,3000", COLS);
    expect(r.hasHeader).toBe(true);
    expect(r.rows[0]).toEqual({ kg: 2, price: 3000 });
  });

  test("no header maps positionally", () => {
    const r = parseCsvImport("0.5,1387634\n1,1589754", COLS);
    expect(r.hasHeader).toBe(false);
    expect(r.rows[0]).toEqual({ kg: 0.5, price: 1387634 });
  });

  test("keeps non-numeric price", () => {
    const r = parseCsvImport("kg,price\n21-30,Liên hệ", COLS);
    expect(r.rows[0]).toEqual({ kg: "21-30", price: "Liên hệ" });
  });

  test("round-trip export → import", () => {
    const rows: RateCardRow[] = [
      { kg: 0.5, price: 1387634 },
      { kg: 1, price: 1589754 },
    ];
    const back = parseCsvImport(exportCsv(rows, COLS), COLS);
    expect(back.rows).toEqual(rows);
  });

  test("empty file noted", () => {
    expect(parseCsvImport("", COLS).notes[0]).toContain("rỗng");
  });

  test("semicolon-delimited with decimal comma", () => {
    const r = parseCsvImport("kg;price\n0,5;1387634\n1;1589754", COLS);
    expect(r.rows[0]).toEqual({ kg: 0.5, price: 1387634 });
    expect(r.rows[1]).toEqual({ kg: 1, price: 1589754 });
  });

  test("tab-delimited file", () => {
    const r = parseCsvImport("kg\tprice\n0.5\t1387634", COLS);
    expect(r.rows[0]).toEqual({ kg: 0.5, price: 1387634 });
  });

  test("row with wrong column count is reported, not silent", () => {
    const r = parseCsvImport("kg,price\n0.5,1,EXTRA", COLS);
    expect(r.notes.some((n) => /có 3 cột/.test(n))).toBe(true);
  });
});

describe("CSV formula injection guard", () => {
  test("prefixes dangerous text cells", () => {
    expect(sanitizeCsvCell("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(sanitizeCsvCell("@cmd")).toBe("'@cmd");
    expect(sanitizeCsvCell("+danger")).toBe("'+danger");
  });
  test("leaves negative numbers intact (not mangled)", () => {
    expect(sanitizeCsvCell("-5000")).toBe("-5000");
    expect(sanitizeCsvCell("1387634")).toBe("1387634");
  });
  test("export sanitizes a malicious text cell", () => {
    const csv = exportCsv([{ kg: "=cmd|'/c calc'!A1", price: 1000 }], COLS);
    expect(csv).toContain("'=cmd");
  });
  test("tab/CR-led digit cell is still neutralized (no whitespace pure-number bypass)", () => {
    expect(sanitizeCsvCell("\t1234")).toBe("'\t1234");
  });
});

describe("CSV delimiter detection ignores quoted labels", () => {
  const cols2: RateCardColumn[] = [
    { code: "kg", label: "Cân nặng", position: 0, type: "number" },
    { code: "us", label: "Giá (US; CA)", position: 1, type: "currency" },
  ];
  test("comma file with semicolon inside a quoted header stays comma-delimited", () => {
    const r = parseCsvImport('Cân nặng,"Giá (US; CA)"\n0.5,1000', cols2);
    expect(r.rows[0]).toEqual({ kg: 0.5, us: 1000 });
  });
});
