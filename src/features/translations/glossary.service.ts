// Glossary service — CRUD for the AI translation glossary table. The
// glossary is the branding/SEO term dictionary injected into every
// /translate prompt to lock terminology (e.g. "Kho Trung Quốc" → "China
// warehouse" / "中国仓库").
//
// Policy (enforced here + documented in spec §3.1):
//   - Exact phrase match, case-sensitive
//   - Sort by LENGTH(term_vi) DESC, then priority DESC (matcher applies longest first)
//   - Whole-phrase substitution; no fuzzy / regex / stemming
//
// See: docs/ai-localization-spec.md §3.1 + §6.2 + §13.

import { getDb } from "@/core/db/client";
import { auditLog } from "@/core/db/mutations";

export const GLOSSARY_CATEGORIES = [
  "shipping",
  "warehouse",
  "ecommerce",
  "payments",
  "marketing",
  "brand",
  "general",
] as const;

export type GlossaryCategory = (typeof GLOSSARY_CATEGORIES)[number];

export interface GlossaryRow {
  id: number;
  term_vi: string;
  term_en: string;
  term_zh: string;
  category: GlossaryCategory;
  notes: string | null;
  priority: number;
  created_at: number;
  updated_at: number;
  updated_by: number | null;
}

export interface GlossaryDuplicateWarning {
  /** Existing row whose term_vi is a substring of the new one (or vice versa). */
  candidate: GlossaryRow;
  /** Direction of overlap: 'existing-contains-new' vs 'new-contains-existing'. */
  direction: "existing-contains-new" | "new-contains-existing";
}

// ────────────────────────────────────────────────────────────────────────
// Reads
// ────────────────────────────────────────────────────────────────────────

/** Full glossary, sorted by category then by VI term for the admin grid. */
export async function listGlossary(): Promise<GlossaryRow[]> {
  const result = await getDb()
    .prepare(
      `SELECT id, term_vi, term_en, term_zh, category, notes, priority,
              created_at, updated_at, updated_by
         FROM glossary
        ORDER BY category, term_vi`,
    )
    .all<GlossaryRow>();
  return result.results ?? [];
}

/** Glossary sorted for prompt injection: longest VI term first, then by
 *  priority. This is the order the matcher applies substitutions so
 *  "Kho Trung Quốc" replaces before "Kho". */
export async function listGlossaryForPrompt(): Promise<GlossaryRow[]> {
  const result = await getDb()
    .prepare(
      `SELECT id, term_vi, term_en, term_zh, category, notes, priority,
              created_at, updated_at, updated_by
         FROM glossary
        ORDER BY LENGTH(term_vi) DESC, priority DESC, id`,
    )
    .all<GlossaryRow>();
  return result.results ?? [];
}

// ────────────────────────────────────────────────────────────────────────
// Duplicate detection (soft governance — never auto-block)
// ────────────────────────────────────────────────────────────────────────

/** Find existing rows that overlap with the proposed term. Operator sees a
 *  warning in the admin UI but is free to proceed; this is governance,
 *  not enforcement. Excludes the row being edited (by `ignoreId`) so
 *  editing an existing entry doesn't warn against itself. */
export async function findGlossaryDuplicates(
  term_vi: string,
  ignoreId?: number,
): Promise<GlossaryDuplicateWarning[]> {
  if (!term_vi.trim()) return [];
  const rows = await listGlossary();
  const warnings: GlossaryDuplicateWarning[] = [];
  for (const row of rows) {
    if (ignoreId !== undefined && row.id === ignoreId) continue;
    if (row.term_vi === term_vi) continue; // exact match — caller's INSERT will fail on UNIQUE
    if (row.term_vi.includes(term_vi)) {
      warnings.push({ candidate: row, direction: "existing-contains-new" });
    } else if (term_vi.includes(row.term_vi)) {
      warnings.push({ candidate: row, direction: "new-contains-existing" });
    }
  }
  return warnings;
}

// ────────────────────────────────────────────────────────────────────────
// Writes
// ────────────────────────────────────────────────────────────────────────

export async function createGlossaryTerm(
  actorId: number,
  input: {
    term_vi: string;
    term_en: string;
    term_zh: string;
    category: GlossaryCategory;
    notes?: string | null;
    priority?: number;
  },
): Promise<GlossaryRow> {
  const inserted = await getDb()
    .prepare(
      `INSERT INTO glossary (term_vi, term_en, term_zh, category, notes, priority, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         RETURNING id, term_vi, term_en, term_zh, category, notes, priority,
                   created_at, updated_at, updated_by`,
    )
    .bind(
      input.term_vi,
      input.term_en,
      input.term_zh,
      input.category,
      input.notes ?? null,
      input.priority ?? 0,
      actorId,
    )
    .first<GlossaryRow>();
  if (!inserted) throw new Error("Không tạo được glossary term.");
  await auditLog(actorId, "create", "glossary", inserted.id, null, inserted);
  return inserted;
}

export async function updateGlossaryTerm(
  actorId: number,
  input: {
    id: number;
    term_vi?: string;
    term_en?: string;
    term_zh?: string;
    category?: GlossaryCategory;
    notes?: string | null;
    priority?: number;
  },
): Promise<GlossaryRow> {
  const before = await getDb()
    .prepare(
      `SELECT id, term_vi, term_en, term_zh, category, notes, priority,
              created_at, updated_at, updated_by
         FROM glossary WHERE id = ? LIMIT 1`,
    )
    .bind(input.id)
    .first<GlossaryRow>();
  if (!before) throw Object.assign(new Error("Glossary term không tồn tại."), { statusCode: 404 });

  const fields: string[] = [];
  const values: unknown[] = [];
  if (input.term_vi !== undefined) {
    fields.push("term_vi = ?");
    values.push(input.term_vi);
  }
  if (input.term_en !== undefined) {
    fields.push("term_en = ?");
    values.push(input.term_en);
  }
  if (input.term_zh !== undefined) {
    fields.push("term_zh = ?");
    values.push(input.term_zh);
  }
  if (input.category !== undefined) {
    fields.push("category = ?");
    values.push(input.category);
  }
  if (input.notes !== undefined) {
    fields.push("notes = ?");
    values.push(input.notes);
  }
  if (input.priority !== undefined) {
    fields.push("priority = ?");
    values.push(input.priority);
  }
  if (fields.length === 0) return before;
  fields.push("updated_at = unixepoch()");
  fields.push("updated_by = ?");
  values.push(actorId);
  values.push(input.id);

  await getDb()
    .prepare(`UPDATE glossary SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();

  const after = await getDb()
    .prepare(
      `SELECT id, term_vi, term_en, term_zh, category, notes, priority,
              created_at, updated_at, updated_by
         FROM glossary WHERE id = ?`,
    )
    .bind(input.id)
    .first<GlossaryRow>();
  await auditLog(actorId, "update", "glossary", input.id, before, after);
  return after!;
}

export async function deleteGlossaryTerm(actorId: number, id: number): Promise<void> {
  const before = await getDb()
    .prepare(
      `SELECT id, term_vi, term_en, term_zh, category, notes, priority,
              created_at, updated_at, updated_by
         FROM glossary WHERE id = ? LIMIT 1`,
    )
    .bind(id)
    .first<GlossaryRow>();
  if (!before) return;
  await getDb().prepare(`DELETE FROM glossary WHERE id = ?`).bind(id).run();
  await auditLog(actorId, "delete", "glossary", id, before, null);
}
