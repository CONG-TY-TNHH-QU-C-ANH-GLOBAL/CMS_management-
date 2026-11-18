import { describe, expect, test } from "bun:test";
import * as XLSX from "xlsx";
import fixture from "./__fixtures__/usps-ga-label.json";
import { parseUspsGaWorkbook } from "./uspsGaWorkbook";

type SheetRows = Record<string, unknown[][]>;
const original = fixture as SheetRows;

function workbook(edit?: (sheets: SheetRows) => void): ArrayBuffer {
  const sheets: SheetRows = structuredClone(original);
  edit?.(sheets);
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}

describe("parseUspsGaWorkbook", () => {
  test("reads every weight and zone in all five workbook tiers", () => {
    const tiers = parseUspsGaWorkbook(workbook());
    expect(tiers).toHaveLength(5);
    for (let tier = 0; tier < 5; tier++) {
      expect(tiers[tier]).toHaveLength(24);
      const source = original[`Tier ${tier + 1}`];
      for (let i = 0; i < 24; i++) {
        const row = source[i + 4] as number[];
        expect(tiers[tier][i]).toEqual({
          oz: Number.parseFloat(String(row[1])),
          g: row[2],
          z1: row[3],
          z2: row[4],
          z3: row[5],
          z4: row[6],
          z5: row[7],
          z6: row[8],
          z7: row[9],
          z8: row[10],
          z9: row[11],
        });
      }
    }
  });

  test("rejects missing sheets and unexpected sheets", () => {
    expect(() =>
      parseUspsGaWorkbook(
        workbook((s) => {
          delete s["Tier 5"];
        }),
      ),
    ).toThrow();
    expect(() =>
      parseUspsGaWorkbook(
        workbook((s) => {
          s.Extra = [["x"]];
        }),
      ),
    ).toThrow();
  });

  test("rejects malformed headers and row counts", () => {
    expect(() =>
      parseUspsGaWorkbook(
        workbook((s) => {
          s["Tier 1"][3][3] = "Zone 2";
        }),
      ),
    ).toThrow();
    expect(() =>
      parseUspsGaWorkbook(
        workbook((s) => {
          s["Tier 2"].splice(10, 1);
        }),
      ),
    ).toThrow();
    expect(() =>
      parseUspsGaWorkbook(
        workbook((s) => {
          s["Tier 3"].push([...s["Tier 3"][27]]);
        }),
      ),
    ).toThrow();
  });

  test("rejects nonnumeric, missing and negative values", () => {
    for (const value of ["NaN", null, -1]) {
      expect(() =>
        parseUspsGaWorkbook(
          workbook((s) => {
            s["Tier 4"][8][6] = value;
          }),
        ),
      ).toThrow();
    }
    expect(() =>
      parseUspsGaWorkbook(
        workbook((s) => {
          s["Tier 5"][4][1] = -1;
        }),
      ),
    ).toThrow();
  });
});
