import type { UspsGaRow } from "./uspsGa.constants";

export interface UspsGaCellChange {
  oz: number;
  zone: number;
  from: number | null;
  to: number;
}

export interface UspsGaTierDiff {
  tier: number;
  changes: UspsGaCellChange[];
}

const ZONE_KEYS = ["z1", "z2", "z3", "z4", "z5", "z6", "z7", "z8", "z9"] as const;

/** Zone cells that differ between the published tiers and the uploaded ones, per tier. */
export function diffUspsGaTiers(current: unknown[][], next: UspsGaRow[][]): UspsGaTierDiff[] {
  return next.map((rows, t) => {
    const before = (current[t] ?? []) as Partial<UspsGaRow>[];
    const changes: UspsGaCellChange[] = [];
    rows.forEach((row, r) => {
      ZONE_KEYS.forEach((key, z) => {
        const old = before[r]?.[key];
        const from = typeof old === "number" ? old : null;
        if (from !== row[key]) changes.push({ oz: row.oz, zone: z + 1, from, to: row[key] });
      });
    });
    return { tier: t + 1, changes };
  });
}
