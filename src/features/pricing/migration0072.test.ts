import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(import.meta.dir, "../../../db/migrations/0072_usps_ga_label_copy.sql"),
  "utf8",
);

function run(rows: [string, string, string][]) {
  const db = new Database(":memory:");
  db.run("CREATE TABLE translations (key TEXT, locale TEXT, value TEXT, updated_at INTEGER)");
  const insert = db.prepare(
    "INSERT INTO translations (key, locale, value, updated_at) VALUES (?, ?, ?, 0)",
  );
  for (const r of rows) insert.run(...r);
  db.exec(sql);
  db.exec(sql); // a re-run must be a no-op
  const out = db.query("SELECT key, locale, value FROM translations ORDER BY rowid").all();
  db.close();
  return out as { key: string; locale: string; value: string }[];
}

describe("migration 0072 USPS GA label copy", () => {
  test("moves the old wording to the new copy", () => {
    const out = run([
      ["domestic.table_desc", "vi", "Biểu phí tham khảo • Zone 1–8"],
      ["label_page.price_title", "en", "The more you buy, the deeper the discount: 1% to 5%."],
      [
        "label_page.price_sub",
        "en",
        "Discounts apply to each carrier's and service's retail price, based on your monthly label volume.",
      ],
      ["label_page.tier", "vi", "Bậc"],
    ]);
    expect(out.map((r) => r.value)).toEqual([
      "Biểu phí tham khảo • Zone 1–9",
      "USPS Ground Advantage label rates by volume tier",
      "Five tiers by monthly label volume. Each tier lists the price per label in USD by weight and Zone 1–9.",
      "Tier",
    ]);
  });

  test("leaves rows an editor has reworded alone", () => {
    const edited: [string, string, string][] = [
      ["domestic.table_desc", "en", "Our rates • Zones 1–8 (edited)"],
      ["label_page.price_title", "vi", "Giá label siêu tốt"],
      ["label_page.tier", "en", "Level"],
    ];
    expect(run(edited).map((r) => r.value)).toEqual(edited.map((r) => r[2]));
  });
});
