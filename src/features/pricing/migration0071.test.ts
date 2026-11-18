import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";
import fixture from "./__fixtures__/usps-ga-label.json";
import { parseUspsGaWorkbook } from "./uspsGaWorkbook";

const sql = readFileSync(
  join(import.meta.dir, "../../../db/migrations/0071_pricing_usps_ga_label.sql"),
  "utf8",
);

const INSERT_RE =
  /VALUES \('(uspsGaLabelT\d)', '([^']+)', 'weight_grid', '([^']+)',\s+'(\{[^']+\})',\s+'(\[[^']+\])',\s+1, 'live'\);/g;

const inserts = [...sql.matchAll(INSERT_RE)].map((m) => ({
  slug: m[1],
  name: m[2],
  description: m[3],
  schema: JSON.parse(m[4]) as { columns: { code: string; semantic?: string; currency?: string }[] },
  data: JSON.parse(m[5]) as unknown[],
}));

function fixtureTiers() {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(fixture as Record<string, unknown[][]>)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return parseUspsGaWorkbook(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

describe("migration 0071 USPS Ground Advantage label", () => {
  test("inserts exactly five live tiers in order", () => {
    expect(inserts.map((i) => i.slug)).toEqual([1, 2, 3, 4, 5].map((n) => `uspsGaLabelT${n}`));
  });

  test("every cell matches the source workbook", () => {
    const tiers = fixtureTiers();
    inserts.forEach((insert, i) => expect(insert.data).toEqual(tiers[i]));
  });

  test("zone columns are USD money, never integer VND", () => {
    for (const { schema } of inserts) {
      expect(schema.columns.map((c) => c.code)).toEqual([
        "oz",
        "g",
        ...Array.from({ length: 9 }, (_, i) => `z${i + 1}`),
      ]);
      for (const col of schema.columns.filter((c) => c.code.startsWith("z"))) {
        expect(col.semantic).toBe("money_usd");
        expect(col.currency).toBe("USD");
      }
    }
  });

  test("descriptions carry the volume band and no effective date", () => {
    expect(inserts[0].description).toContain("Dưới 1.000 label/tháng");
    expect(inserts[4].description).toContain("Từ 10.000 label/tháng");
    for (const { description } of inserts) expect(description).not.toContain("Hiệu lực");
  });
});
