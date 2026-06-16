// Pure tests for the diff engine. Run: bun test

import { describe, expect, test } from "bun:test";

import { diffRateCard } from "./rateCardDiff";
import { inferGridConfig, type RateCardColumn, type RateCardRow } from "./rateCardTypes";

const COLS: RateCardColumn[] = [
  { code: "kg", label: "Cân nặng", position: 0, type: "number" },
  { code: "price", label: "Giá", position: 1, type: "currency" },
];
const cfg = (rows: RateCardRow[]) => inferGridConfig(COLS, rows);

describe("diffRateCard", () => {
  test("classifies added/removed/updated/unchanged", () => {
    const published: RateCardRow[] = [
      { kg: 0.5, price: 1000 },
      { kg: 1, price: 2000 },
      { kg: 1.5, price: 3000 }, // will be removed
    ];
    const draft: RateCardRow[] = [
      { kg: 0.5, price: 1000 }, // unchanged
      { kg: 1, price: 2500 }, // updated
      { kg: 2, price: 4000 }, // added
    ];
    const d = diffRateCard(published, draft, cfg(published));
    expect(d.unchanged).toBe(1);
    expect(d.updated).toBe(1);
    expect(d.added).toBe(1);
    expect(d.removed).toBe(1);
  });

  test("updated row carries old→new + amount + pct", () => {
    const d = diffRateCard(
      [{ kg: 1, price: 1000 }],
      [{ kg: 1, price: 1200 }],
      cfg([{ kg: 1, price: 1000 }]),
    );
    const updated = d.rows.find((r) => r.kind === "updated");
    expect(updated?.changes[0]).toMatchObject({
      column: "price",
      oldValue: 1000,
      newValue: 1200,
      changeAmount: 200,
      changePct: 20,
    });
  });

  test("numeric/string equality: 1000 === '1000' = unchanged", () => {
    const d = diffRateCard(
      [{ kg: 1, price: 1000 }],
      [{ kg: "1", price: "1000" }],
      cfg([{ kg: 1, price: 1000 }]),
    );
    expect(d.unchanged).toBe(1);
    expect(d.updated).toBe(0);
  });

  test("non-numeric price change still diffs", () => {
    const d = diffRateCard(
      [{ kg: 1, price: 1000 }],
      [{ kg: 1, price: "Liên hệ" }],
      cfg([{ kg: 1, price: 1000 }]),
    );
    const u = d.rows.find((r) => r.kind === "updated");
    expect(u?.changes[0].changeAmount).toBeNull();
    expect(u?.changes[0].newValue).toBe("Liên hệ");
  });

  test("empty draft removes everything", () => {
    const d = diffRateCard(
      [
        { kg: 1, price: 1 },
        { kg: 2, price: 2 },
      ],
      [],
      cfg([{ kg: 1, price: 1 }]),
    );
    expect(d.removed).toBe(2);
  });
});
