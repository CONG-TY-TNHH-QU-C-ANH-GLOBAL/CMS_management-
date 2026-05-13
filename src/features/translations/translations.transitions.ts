// I/O wrapper for translation state transitions. Composes pure
// validateTransition + diffPatch (from translations.transitions.pure) with
// D1 + auditLog. Direct UPDATE … SET status = … outside this module is a
// regression — see docs/ai-localization-spec.md §4.6.

import { getDb } from "@/core/db/client";
import { auditLog } from "@/core/db/mutations";

import {
  diffPatch,
  validateTransition,
  type TransitionEvent,
  type TransitionRow,
  type TranslationStatus,
  type TranslationTable,
} from "./translations.transitions.pure";

// Re-export pure types + functions so consumers can do
// `import { applyTransition, validateTransition } from "@/features/translations"`
// without knowing the pure/impure split.
export * from "./translations.transitions.pure";

export class InvalidTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTransitionError";
  }
}

export class TransitionNotFoundError extends Error {
  constructor(table: string, id: number) {
    super(`Row not found in ${table}: id=${id}`);
    this.name = "TransitionNotFoundError";
  }
}

/** Apply a transition to a row in the given translation table.
 *
 *  Side effects:
 *    1. SELECT current row (status, stale_reason, reviewed_at, reviewed_by)
 *    2. validateTransition(from, event) → throw InvalidTransitionError if rejected
 *    3. diffPatch(...) → compute column patch (only changed keys)
 *    4. UPDATE row with patch
 *    5. INSERT audit_log row: action='update', entity=table, entity_id=id,
 *       before/after JSON includes status + stale_reason + event kind.
 *
 *  Not wrapped in an explicit transaction — D1 statements are atomic per
 *  prepare/run, and audit_log is append-only forensics, not authoritative
 *  state. Phase 7 may revisit if we add Cloudflare Queues / Durable Objects. */
export async function applyTransition(
  table: TranslationTable,
  id: number,
  event: TransitionEvent,
): Promise<{ from: TranslationStatus; to: TranslationStatus }> {
  const db = getDb();
  const current = await db
    .prepare(
      `SELECT id, status, stale_reason, reviewed_at, reviewed_by
         FROM ${table} WHERE id = ? LIMIT 1`,
    )
    .bind(id)
    .first<TransitionRow>();
  if (!current) throw new TransitionNotFoundError(table, id);

  const result = validateTransition(current.status, event);
  if (!result.ok) throw new InvalidTransitionError(result.error);

  const now = Math.floor(Date.now() / 1000);
  const patch = diffPatch(current.status, result.to, event, now);

  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    fields.push(`${key} = ?`);
    values.push(value);
  }
  values.push(id);
  await db
    .prepare(`UPDATE ${table} SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();

  const actorId = "userId" in event ? event.userId : 0;
  await auditLog(
    actorId,
    "update",
    table,
    id,
    { status: current.status, stale_reason: current.stale_reason, event_kind: null },
    {
      status: result.to,
      stale_reason: patch.stale_reason ?? current.stale_reason,
      event_kind: event.kind,
    },
  );

  return { from: current.status, to: result.to };
}

/** Public alias matching the spec's prose name. */
export const transitionTranslationStatus = applyTransition;
