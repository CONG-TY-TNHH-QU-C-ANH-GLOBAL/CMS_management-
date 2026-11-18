import { describe, expect, test } from "bun:test";
import type { UspsGaRow } from "./uspsGa.constants";
import { diffUspsGaTiers } from "./uspsGaDiff";

const row = (oz: number, base: number): UspsGaRow => ({
  oz,
  g: Math.round(oz * 28.3495),
  z1: base,
  z2: base,
  z3: base,
  z4: base,
  z5: base,
  z6: base,
  z7: base,
  z8: base,
  z9: base,
});

describe("diffUspsGaTiers", () => {
  test("reports only the zone cells that changed, per tier", () => {
    const current = [[row(4, 4.49), row(8, 5)], [row(4, 4.45)]];
    const next = [[row(4, 4.49), { ...row(8, 5), z9: 7.92 }], [row(4, 4.45)]];
    expect(diffUspsGaTiers(current, next)).toEqual([
      { tier: 1, changes: [{ oz: 8, zone: 9, from: 5, to: 7.92 }] },
      { tier: 2, changes: [] },
    ]);
  });

  test("treats a missing or non-numeric published cell as a change from null", () => {
    const next = [[row(4, 1)]];
    expect(diffUspsGaTiers([[]], next)[0].changes).toHaveLength(9);
    expect(diffUspsGaTiers([[{ oz: 4, z1: "1" }]], next)[0].changes[0]).toEqual({
      oz: 4,
      zone: 1,
      from: null,
      to: 1,
    });
  });
});
