// Rate Card Builder — diff engine.
//
// Pure module. Compares published rows vs draft rows keyed by the weight
// column, classifying each as added / removed / updated / unchanged and
// computing per-cell change amount and percent for the review screen.

import { toNumberOrNull, type GridConfig } from "./rateCardTypes";
import type { CellValue, DiffCellChange, DiffResult, DiffRow, RateCardRow } from "./rateCardTypes";

function keyOf(row: RateCardRow, weightCol: string): string {
  const raw = row[weightCol];
  const n = toNumberOrNull(raw as never);
  return n !== null
    ? `n:${n}`
    : `s:${String(raw ?? "")
        .trim()
        .toLowerCase()}`;
}

function eq(a: CellValue | undefined, b: CellValue | undefined): boolean {
  const an = toNumberOrNull(a as never);
  const bn = toNumberOrNull(b as never);
  if (an !== null && bn !== null) return an === bn;
  return String(a ?? "") === String(b ?? "");
}

function cellChange(
  column: string,
  oldV: CellValue | undefined,
  newV: CellValue | undefined,
): DiffCellChange {
  const on = toNumberOrNull(oldV as never);
  const nn = toNumberOrNull(newV as never);
  const changeAmount = on !== null && nn !== null ? nn - on : null;
  const changePct = on !== null && nn !== null && on !== 0 ? round2(((nn - on) / on) * 100) : null;
  return { column, oldValue: oldV, newValue: newV, changeAmount, changePct };
}

/**
 * Diff published vs draft. Rows are matched by their weight-column key.
 * Duplicate keys within a side are matched positionally by occurrence so a
 * table with repeated weights still diffs deterministically.
 */
export function diffRateCard(
  published: RateCardRow[],
  draft: RateCardRow[],
  config: GridConfig,
): DiffResult {
  const { weightCol, columns } = config;
  const colCodes = columns.map((c) => c.code);

  // Map key → queue of old rows (handle dup keys by occurrence).
  const oldByKey = new Map<string, RateCardRow[]>();
  for (const row of published) {
    const k = keyOf(row, weightCol);
    (oldByKey.get(k) ?? oldByKey.set(k, []).get(k)!).push(row);
  }

  const result: DiffRow[] = [];
  let added = 0;
  let removed = 0;
  let updated = 0;
  let unchanged = 0;

  for (const newRow of draft) {
    const k = keyOf(newRow, weightCol);
    const queue = oldByKey.get(k);
    const oldRow = queue && queue.length ? queue.shift() : undefined;

    if (!oldRow) {
      result.push({ kind: "added", key: displayKey(k, newRow, weightCol), newRow, changes: [] });
      added++;
      continue;
    }

    const changes: DiffCellChange[] = [];
    for (const code of colCodes) {
      if (code === weightCol) continue;
      if (!eq(oldRow[code], newRow[code]))
        changes.push(cellChange(code, oldRow[code], newRow[code]));
    }
    if (changes.length === 0) {
      result.push({
        kind: "unchanged",
        key: displayKey(k, newRow, weightCol),
        oldRow,
        newRow,
        changes: [],
      });
      unchanged++;
    } else {
      result.push({
        kind: "updated",
        key: displayKey(k, newRow, weightCol),
        oldRow,
        newRow,
        changes,
      });
      updated++;
    }
  }

  // Anything left in the old queues was removed.
  for (const [k, queue] of oldByKey) {
    for (const oldRow of queue) {
      result.push({ kind: "removed", key: displayKey(k, oldRow, weightCol), oldRow, changes: [] });
      removed++;
    }
  }

  return { rows: result, added, removed, updated, unchanged };
}

function displayKey(k: string, row: RateCardRow, weightCol: string): string {
  void k;
  return String(row[weightCol] ?? "");
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
