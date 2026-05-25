/**
 * Walks a value recursively and replaces every leaf with a string tag
 * representing its type. Used by D4.2+ contract snapshot tests so the
 * snapshot captures the SHAPE of an API response (which keys exist, what
 * types they hold) rather than the values (which drift across runs because
 * of timestamps, autoincrement IDs, R2 URLs, etc.).
 *
 * Rules
 * - `null` → "null"  (distinct from absent key)
 * - primitives → typeof tag: "string" | "number" | "boolean" | "bigint" | "symbol" | "undefined" | "function"
 * - arrays → tagged as "array<elem>" where elem is the recursive shape of
 *   the first element, OR "array<empty>" for [].  Heterogeneous arrays are
 *   represented by their first element only — snapshot tests using this
 *   helper must seed homogeneous fixtures.
 * - plain objects → recursively shaped, keys sorted to keep snapshot
 *   deterministic across runs.
 *
 * Determinism notes
 * Sorted keys + first-element-only-array means two responses with the same
 * SHAPE produce byte-identical snapshots regardless of insertion order or
 * row count.  That is the whole point: detect drift in keys/types, ignore
 * drift in values.
 */

export type Shape =
  | { __type: "null" }
  | { __type: "primitive"; t: string }
  | { __type: "array"; elem: Shape | "empty" }
  | { __type: "object"; props: Record<string, Shape> };

export function extractShape(value: unknown): Shape {
  if (value === null) return { __type: "null" };
  if (Array.isArray(value)) {
    if (value.length === 0) return { __type: "array", elem: "empty" };
    return { __type: "array", elem: extractShape(value[0]) };
  }
  if (typeof value === "object") {
    const props: Record<string, Shape> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      props[key] = extractShape((value as Record<string, unknown>)[key]);
    }
    return { __type: "object", props };
  }
  return { __type: "primitive", t: typeof value };
}
