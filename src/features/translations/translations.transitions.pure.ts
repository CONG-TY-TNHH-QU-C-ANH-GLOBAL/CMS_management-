// PURE state-machine logic for translation status transitions. No I/O,
// no DB, no globals — safe to import from anywhere including unit tests.
// The impure DB wrapper lives in translations.transitions.ts and composes
// these functions with getDb() + auditLog().
//
// See: docs/ai-localization-spec.md §4.6.

export type TranslationStatus = "draft" | "reviewed" | "stale" | "failed";

export type StaleReason = "source_changed" | "prompt_changed" | "model_changed" | "manual_mark";

export type TranslationTable =
  | "faq_translations"
  | "service_block_translations"
  | "testimonial_translations"
  | "homepage_block_translations"
  | "careers_job_translations"
  | "blog_post_translations"
  | "policy_translations"
  | "contact_location_translations"
  | "shipping_route_translations";

export type TransitionEvent =
  | { kind: "ai_completed" }
  | { kind: "ai_failed"; error: string }
  | { kind: "operator_approved"; userId: number }
  | { kind: "operator_edited"; userId: number }
  | { kind: "source_changed" }
  | { kind: "prompt_changed" }
  | { kind: "model_changed" }
  | { kind: "manual_mark_stale"; userId: number }
  | { kind: "operator_retried"; userId: number };

export type TransitionEventKind = TransitionEvent["kind"];

export interface TransitionPatch {
  status: TranslationStatus;
  stale_reason: StaleReason | null;
  reviewed_at: number | null;
  reviewed_by: number | null;
  updated_at: number;
}

export interface TransitionRow {
  id: number;
  status: TranslationStatus;
  stale_reason: StaleReason | null;
  reviewed_at: number | null;
  reviewed_by: number | null;
}

// ────────────────────────────────────────────────────────────────────────
// Transition matrix — mirrors docs/ai-localization-spec.md §4.6 exactly.
// `null` = explicitly rejected; `undefined` (key missing) = also rejected.
// ────────────────────────────────────────────────────────────────────────

const TRANSITIONS: Record<
  TranslationStatus,
  Partial<Record<TransitionEventKind, TranslationStatus | null>>
> = {
  draft: {
    ai_completed: "draft",
    ai_failed: "failed",
    operator_approved: "reviewed",
    operator_edited: "draft",
    source_changed: "stale",
    prompt_changed: "stale",
    model_changed: "stale",
    manual_mark_stale: "stale",
    operator_retried: "draft",
  },
  reviewed: {
    ai_completed: "draft",
    ai_failed: "failed",
    operator_approved: "reviewed",
    operator_edited: "draft",
    source_changed: "stale",
    prompt_changed: "stale",
    model_changed: "stale",
    manual_mark_stale: "stale",
    operator_retried: "draft",
  },
  stale: {
    ai_completed: "draft",
    ai_failed: "failed",
    operator_approved: "reviewed",
    operator_edited: "draft",
    source_changed: "stale",
    prompt_changed: "stale",
    model_changed: "stale",
    manual_mark_stale: "stale",
    operator_retried: "draft",
  },
  failed: {
    ai_completed: "draft",
    ai_failed: "failed",
    operator_retried: "draft",
    // Allow the operator to SALVAGE a failed translation by editing it — the
    // edit moves it to `draft` (then they can Approve). Previously this was
    // rejected, leaving the only recovery path as Delete + Re-translate.
    operator_edited: "draft",
    // Still can't approve a never-succeeded row directly — must edit → draft first.
    operator_approved: null,
    source_changed: null,
    prompt_changed: null,
    model_changed: null,
    manual_mark_stale: null,
  },
};

export type ValidationResult = { ok: true; to: TranslationStatus } | { ok: false; error: string };

export function validateTransition(
  from: TranslationStatus,
  event: TransitionEvent,
): ValidationResult {
  const map = TRANSITIONS[from];
  if (!map) return { ok: false, error: `Unknown status: '${from}'` };
  const next = map[event.kind];
  if (next === null) {
    return { ok: false, error: `Cannot ${event.kind} from status='${from}'` };
  }
  if (next === undefined) {
    return { ok: false, error: `Unknown event '${event.kind}' for status='${from}'` };
  }
  return { ok: true, to: next };
}

function staleReasonFromEvent(kind: TransitionEventKind): StaleReason | null {
  switch (kind) {
    case "source_changed":
      return "source_changed";
    case "prompt_changed":
      return "prompt_changed";
    case "model_changed":
      return "model_changed";
    case "manual_mark_stale":
      return "manual_mark";
    default:
      return null;
  }
}

/** Compute the column patch for the DB UPDATE. Only includes keys whose
 *  values genuinely changed across the transition, so callers don't
 *  accidentally clobber stale_reason / reviewed_at when the status move
 *  didn't cross that boundary.
 *
 *  `now` is injected so tests can pin time. */
export function diffPatch(
  from: TranslationStatus,
  to: TranslationStatus,
  event: TransitionEvent,
  now: number,
): Partial<TransitionPatch> {
  const out: Partial<TransitionPatch> = { status: to, updated_at: now };

  // stale_reason changes ONLY when CROSSING the stale boundary.
  if (to === "stale") {
    out.stale_reason = staleReasonFromEvent(event.kind);
  } else if (from === "stale") {
    // to is implicitly != 'stale' here (caught by the if-branch above)
    out.stale_reason = null;
  }

  // reviewed_at / reviewed_by: set when entering reviewed via approval;
  // cleared when leaving reviewed.
  if (to === "reviewed" && event.kind === "operator_approved") {
    out.reviewed_at = now;
    out.reviewed_by = event.userId;
  } else if (from === "reviewed" && to !== "reviewed") {
    out.reviewed_at = null;
    out.reviewed_by = null;
  }

  return out;
}
