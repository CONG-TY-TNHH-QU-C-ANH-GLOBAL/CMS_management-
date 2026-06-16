// Rate Card Builder — editor state hook.
//
// Owns the draft state machine, undo/redo history, changed-cell highlighting,
// validation projection, localStorage draft persistence, and publish. The grid
// and dialogs are thin: they call pure logic modules and feed the resulting
// rows back through `applyOp`. All business logic lives in the rateCard*
// pure modules; this hook only orchestrates React state.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { diffRateCard } from "./rateCardDiff";
import { normalizeCell } from "./rateCardParse";
import {
  inferGridConfig,
  isWeightCode,
  toNumberOrNull,
  type DiffResult,
  type GridConfig,
  type RateCardColumn,
  type RateCardRow,
  type ValidationResult,
} from "./rateCardTypes";
import { validateRateCard } from "./rateCardValidation";

/** Grid row = logical row + a stable React key. */
export interface GridRow extends RateCardRow {
  __id: string;
}

export type RateCardStatus =
  | "published"
  | "draft_dirty"
  | "validation_failed"
  | "ready_to_publish"
  | "publishing";

export interface OpResult {
  rows: RateCardRow[];
  changedCells: string[];
}

let idCounter = 0;
function genId(): string {
  idCounter += 1;
  return `r${idCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

const HISTORY_LIMIT = 50;

function stripIds(rows: GridRow[]): RateCardRow[] {
  return rows.map(({ __id, ...rest }) => {
    void __id;
    return rest;
  });
}

/** Re-attach stable ids to plain rows, reusing prior ids positionally. */
function attachIds(plain: RateCardRow[], prev: GridRow[]): GridRow[] {
  return plain.map((r, i) => ({ __id: prev[i]?.__id ?? genId(), ...r }));
}

/** Build initial cols + rows from a weight_grid table payload. */
export function normalizeWeightGrid(
  data: unknown,
  schemaCols: RateCardColumn[],
): { rows: GridRow[]; cols: RateCardColumn[] } {
  const arr = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  const keySet = new Set<string>();
  for (const r of arr)
    if (r && typeof r === "object") for (const k of Object.keys(r)) keySet.add(k);
  for (const c of schemaCols) keySet.add(c.code);

  const orderedCodes: string[] = [];
  for (const c of schemaCols)
    if (keySet.has(c.code)) {
      orderedCodes.push(c.code);
      keySet.delete(c.code);
    }
  for (const k of Array.from(keySet)) orderedCodes.push(k);

  const cols: RateCardColumn[] = orderedCodes.map((code, i) => {
    const found = schemaCols.find((c) => c.code === code);
    return (
      found ?? {
        code,
        label: isWeightCode(code) ? "Cân nặng" : code.toUpperCase(),
        position: i,
        type: isWeightCode(code) ? "number" : "currency",
      }
    );
  });

  const rows: GridRow[] = arr.map((r) => {
    const row: GridRow = { __id: genId() };
    for (const code of orderedCodes) row[code] = (r?.[code] as never) ?? "";
    return row;
  });
  return { rows, cols };
}

/**
 * Denormalize grid rows → data_json shape (drop empty cells). Coerces each
 * value through normalizeCell for its column type, so numeric columns always
 * emit numbers to the landing consumer even if a cell slipped through as a
 * numeric-looking string (e.g. a restored draft). Non-numeric strings such as
 * "Liên hệ" / bracket weights are preserved.
 */
export function denormalizeWeightGrid(rows: GridRow[], cols: RateCardColumn[]): RateCardRow[] {
  const typeByCode = new Map(cols.map((c) => [c.code, c.type]));
  return rows.map((r) => {
    const out: RateCardRow = {};
    for (const [k, v] of Object.entries(r)) {
      if (k === "__id") continue;
      if (v === "" || v === null || v === undefined) continue;
      const type = typeByCode.get(k);
      out[k] = type ? normalizeCell(v as never, type) : (v as never);
    }
    return out;
  });
}

/**
 * A column is "strict numeric" if every non-empty published value parses as a
 * number (or the column has no data yet). Columns that already hold legitimate
 * text — "Liên hệ" prices, "21-30" weight brackets — are excluded so they stay
 * lenient. Used to escalate non-numeric input from warning → critical.
 */
export function inferStrictNumericCols(
  publishedRows: RateCardRow[],
  cols: RateCardColumn[],
): Set<string> {
  const strict = new Set<string>();
  for (const c of cols) {
    if (c.type === "text") continue;
    let sawNonNumeric = false;
    for (const r of publishedRows) {
      const v = r[c.code];
      if (v === "" || v === null || v === undefined) continue;
      if (toNumberOrNull(v) === null) {
        sawNonNumeric = true;
        break;
      }
    }
    if (!sawNonNumeric) strict.add(c.code);
  }
  return strict;
}

interface StoredDraft {
  baseVersion: number;
  savedAt: number;
  rows: RateCardRow[];
  cols: RateCardColumn[];
}

function draftKey(slug: string): string {
  return `ratecard:draft:${slug}`;
}

function readStoredDraft(slug: string, baseVersion: number): StoredDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft;
    if (parsed.baseVersion !== baseVersion) {
      localStorage.removeItem(draftKey(slug)); // stale vs newer published version
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export interface UseRateCardEditorArgs {
  slug: string;
  version: number;
  data: unknown;
  schemaCols: RateCardColumn[];
  /** Full parsed schema object (preserved on publish so extra metadata — step,
   *  description, future keys — is never dropped). */
  schemaRaw?: unknown;
  declaredStep?: number | null;
  currency?: string;
  onPublish: (input: {
    data_json: string;
    schema_json: string;
    comment: string | null;
    expectedVersion: number;
  }) => Promise<void>;
}

export function useRateCardEditor(args: UseRateCardEditorArgs) {
  const { slug, version, data, schemaCols } = args;

  const initial = useMemo(() => normalizeWeightGrid(data, schemaCols), [data, schemaCols]);
  const [rows, setRowsState] = useState<GridRow[]>(initial.rows);
  const [cols, setCols] = useState<RateCardColumn[]>(initial.cols);
  const [past, setPast] = useState<GridRow[][]>([]);
  const [future, setFuture] = useState<GridRow[][]>([]);
  const [changedCells, setChangedCells] = useState<Set<string>>(new Set());
  const [publishing, setPublishing] = useState(false);
  const [lastOpLabel, setLastOpLabel] = useState<string | null>(null);

  const [storedDraftAt, setStoredDraftAt] = useState<number | null>(null);

  // Detect an existing stored draft on mount (per slug+version).
  useEffect(() => {
    const d = readStoredDraft(slug, version);
    setStoredDraftAt(d ? d.savedAt : null);
  }, [slug, version]);

  const config: GridConfig = useMemo(
    () =>
      inferGridConfig(cols, stripIds(rows), {
        step: args.declaredStep ?? undefined,
        currency: args.currency,
      }),
    [cols, rows, args.declaredStep, args.currency],
  );

  const plainRows = useMemo(() => stripIds(rows), [rows]);
  const initialPlain = useMemo(() => stripIds(initial.rows), [initial.rows]);

  const isDirty = useMemo(
    () => JSON.stringify(plainRows) !== JSON.stringify(initialPlain),
    [plainRows, initialPlain],
  );

  // Infer which columns this table treats as strictly numeric from the
  // PUBLISHED data: a column with ≥1 value, all numeric. Non-numeric input into
  // such a column becomes a critical error. A column that already holds text
  // (e.g. "Liên hệ") is lenient. Empty columns default to strict so a fresh
  // numeric grid still rejects typo'd text.
  const strictNumericCols = useMemo(
    () => inferStrictNumericCols(initialPlain, initial.cols),
    [initialPlain, initial.cols],
  );

  const validation: ValidationResult = useMemo(
    () => validateRateCard(plainRows, config, { strictNumericCols }),
    [plainRows, config, strictNumericCols],
  );

  const status: RateCardStatus = useMemo(() => {
    if (publishing) return "publishing";
    if (!isDirty) return "published";
    return validation.criticalCount > 0 ? "validation_failed" : "ready_to_publish";
  }, [publishing, isDirty, validation.criticalCount]);

  // Refs mirror the latest state so mutators compute the next state OUTSIDE of
  // any setState updater. This keeps updaters pure (no nested setState), which
  // is correct under React 19 concurrent/StrictMode re-invocation and avoids
  // duplicate history entries.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const pastRef = useRef(past);
  pastRef.current = past;
  const futureRef = useRef(future);
  futureRef.current = future;
  const colsRef = useRef(cols);
  colsRef.current = cols;

  /** Commit a new rows array, pushing the prior rows onto the undo stack once. */
  const commit = useCallback((nextRows: GridRow[], changed: string[], label: string | null) => {
    setPast([...pastRef.current.slice(-(HISTORY_LIMIT - 1)), rowsRef.current]);
    setFuture([]);
    setRowsState(nextRows);
    setChangedCells(new Set(changed));
    if (label !== null) setLastOpLabel(label);
  }, []);

  /** Commit a pure-op result (paste / formula / mass-update / import). */
  const applyOp = useCallback(
    (result: OpResult, label: string) => {
      commit(attachIds(result.rows, rowsRef.current), result.changedCells, label);
    },
    [commit],
  );

  /** Inline grid edit path (react-data-grid onRowsChange). */
  const setGridRows = useCallback(
    (next: GridRow[], changedKeys: string[] = []) => {
      commit(next, changedKeys, null);
    },
    [commit],
  );

  const addRow = useCallback(() => {
    const empty: GridRow = { __id: genId() };
    for (const c of colsRef.current) empty[c.code] = "";
    commit([...rowsRef.current, empty], [], null);
  }, [commit]);

  const removeRows = useCallback(
    (ids: Set<string>) => {
      if (ids.size === 0) return;
      commit(
        rowsRef.current.filter((r) => !ids.has(r.__id)),
        [],
        null,
      );
    },
    [commit],
  );

  // Column-shape changes invalidate the row-history (rows gain/lose a key), so
  // clear undo/redo to prevent shape desync between cols and historical rows.
  const addColumn = useCallback((code: string, label: string) => {
    setCols((c) => [
      ...c,
      { code, label: label || code.toUpperCase(), position: c.length, type: "currency" },
    ]);
    setRowsState((rs) => rs.map((r) => ({ ...r, [code]: "" })));
    setPast([]);
    setFuture([]);
    setChangedCells(new Set());
  }, []);

  const removeColumn = useCallback((code: string) => {
    setCols((c) => c.filter((col) => col.code !== code));
    setRowsState((rs) =>
      rs.map((r) => {
        const { [code]: _drop, ...rest } = r;
        void _drop;
        return { ...rest, __id: r.__id } as GridRow;
      }),
    );
    setPast([]);
    setFuture([]);
    setChangedCells(new Set());
  }, []);

  const undo = useCallback(() => {
    const p = pastRef.current;
    if (p.length === 0) return;
    const prev = p[p.length - 1];
    setFuture([rowsRef.current, ...futureRef.current].slice(0, HISTORY_LIMIT));
    setPast(p.slice(0, -1));
    setRowsState(prev);
    setChangedCells(new Set());
  }, []);

  const redo = useCallback(() => {
    const f = futureRef.current;
    if (f.length === 0) return;
    const next = f[0];
    setPast([...pastRef.current, rowsRef.current].slice(-HISTORY_LIMIT));
    setFuture(f.slice(1));
    setRowsState(next);
    setChangedCells(new Set());
  }, []);

  const discard = useCallback(() => {
    commit(initial.rows, [], null);
    setCols(initial.cols);
  }, [initial.rows, initial.cols, commit]);

  // --- Draft persistence ---
  const saveDraft = useCallback(() => {
    const draft: StoredDraft = {
      baseVersion: version,
      savedAt: Date.now(),
      rows: stripIds(rows),
      cols,
    };
    try {
      localStorage.setItem(draftKey(slug), JSON.stringify(draft));
      setStoredDraftAt(draft.savedAt);
    } catch {
      // localStorage may be full / disabled; surfaced by caller via return.
    }
  }, [rows, cols, slug, version]);

  const restoreDraft = useCallback(() => {
    const d = readStoredDraft(slug, version);
    if (!d) return false;
    commit(attachIds(d.rows, rowsRef.current), [], null);
    setCols(d.cols);
    return true;
  }, [slug, version, commit]);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(draftKey(slug));
    } catch {
      /* ignore */
    }
    setStoredDraftAt(null);
  }, [slug]);

  // --- Diff vs published ---
  const computeDiff = useCallback(
    (): DiffResult => diffRateCard(initialPlain, plainRows, config),
    [initialPlain, plainRows, config],
  );

  // --- Publish ---
  const publish = useCallback(
    async (comment: string | null) => {
      setPublishing(true);
      try {
        const dataJson = JSON.stringify(denormalizeWeightGrid(rows, cols));
        // Preserve any extra schema metadata the backend stored (step,
        // description, future keys); only columns/currency/type are owned here.
        const baseSchema =
          args.schemaRaw && typeof args.schemaRaw === "object" && !Array.isArray(args.schemaRaw)
            ? (args.schemaRaw as Record<string, unknown>)
            : {};
        const schemaJson = JSON.stringify({
          ...baseSchema,
          type: "weight_grid",
          columns: cols,
          currency: config.currency,
          ...(config.step != null ? { step: config.step } : {}),
        });
        await args.onPublish({
          data_json: dataJson,
          schema_json: schemaJson,
          comment,
          expectedVersion: version,
        });
        clearDraft();
      } finally {
        setPublishing(false);
      }
    },
    [rows, cols, config.currency, config.step, version, args, clearDraft],
  );

  // --- Unsaved-changes guard ---
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  return {
    rows,
    cols,
    config,
    status,
    isDirty,
    validation,
    changedCells,
    lastOpLabel,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    publishing,
    storedDraftAt,
    setGridRows,
    applyOp,
    addRow,
    removeRows,
    addColumn,
    removeColumn,
    undo,
    redo,
    discard,
    saveDraft,
    restoreDraft,
    clearDraft,
    computeDiff,
    publish,
    plainRows,
  };
}
