// Unit tests for the translation state machine — pure-function level only.
// Run: bun test src/features/translations/translations.transitions.test.ts
//
// Coverage target: ALL 36 cells of the 4×9 transition matrix (4 statuses ×
// 9 event kinds), plus side-effect logic (stale_reason set/clear, reviewed_at
// set/clear).
//
// Why pure tests only: applyTransition() is just a thin I/O wrapper around
// validateTransition + diffPatch. Testing the pure functions covers the
// matrix exhaustively without needing a D1 mock.

import { describe, expect, test } from "bun:test";

import {
  diffPatch,
  validateTransition,
  type TransitionEvent,
  type TranslationStatus,
} from "./translations.transitions.pure";

// ────────────────────────────────────────────────────────────────────────
// Matrix expectations — mirrors docs/ai-localization-spec.md §4.6 exactly.
// If you change this table, change the spec AND the production matrix.
// ────────────────────────────────────────────────────────────────────────

type ExpectedOutcome = TranslationStatus | "REJECT";

const MATRIX: Record<TranslationStatus, Record<TransitionEvent["kind"], ExpectedOutcome>> = {
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
    operator_approved: "REJECT",
    // A6: operators can now SALVAGE a failed translation by editing it → draft
    // (then Approve). Previously rejected, which left only Delete + Re-translate.
    operator_edited: "draft",
    source_changed: "REJECT",
    prompt_changed: "REJECT",
    model_changed: "REJECT",
    manual_mark_stale: "REJECT",
    operator_retried: "draft",
  },
};

const STATUSES: TranslationStatus[] = ["draft", "reviewed", "stale", "failed"];
const USER_ID = 42;

function eventOf(kind: TransitionEvent["kind"]): TransitionEvent {
  switch (kind) {
    case "ai_completed":
      return { kind };
    case "ai_failed":
      return { kind, error: "test failure" };
    case "operator_approved":
      return { kind, userId: USER_ID };
    case "operator_edited":
      return { kind, userId: USER_ID };
    case "source_changed":
      return { kind };
    case "prompt_changed":
      return { kind };
    case "model_changed":
      return { kind };
    case "manual_mark_stale":
      return { kind, userId: USER_ID };
    case "operator_retried":
      return { kind, userId: USER_ID };
  }
}

// ────────────────────────────────────────────────────────────────────────
// validateTransition: every cell of the 4×9 matrix
// ────────────────────────────────────────────────────────────────────────

describe("validateTransition — exhaustive matrix", () => {
  for (const from of STATUSES) {
    for (const kind of Object.keys(MATRIX[from]) as TransitionEvent["kind"][]) {
      const expected = MATRIX[from][kind];
      test(`${from} + ${kind} → ${expected}`, () => {
        const result = validateTransition(from, eventOf(kind));
        if (expected === "REJECT") {
          expect(result.ok).toBe(false);
        } else {
          expect(result.ok).toBe(true);
          if (result.ok) expect(result.to).toBe(expected);
        }
      });
    }
  }
});

// ────────────────────────────────────────────────────────────────────────
// diffPatch — side-effect logic
// ────────────────────────────────────────────────────────────────────────

const NOW = 1_700_000_000;

describe("diffPatch — stale_reason management", () => {
  test("draft → stale via source_changed sets stale_reason='source_changed'", () => {
    const patch = diffPatch("draft", "stale", eventOf("source_changed"), NOW);
    expect(patch.status).toBe("stale");
    expect(patch.stale_reason).toBe("source_changed");
  });

  test("reviewed → stale via prompt_changed sets stale_reason='prompt_changed'", () => {
    const patch = diffPatch("reviewed", "stale", eventOf("prompt_changed"), NOW);
    expect(patch.stale_reason).toBe("prompt_changed");
  });

  test("draft → stale via model_changed sets stale_reason='model_changed'", () => {
    const patch = diffPatch("draft", "stale", eventOf("model_changed"), NOW);
    expect(patch.stale_reason).toBe("model_changed");
  });

  test("reviewed → stale via manual_mark_stale sets stale_reason='manual_mark'", () => {
    const patch = diffPatch("reviewed", "stale", eventOf("manual_mark_stale"), NOW);
    expect(patch.stale_reason).toBe("manual_mark");
  });

  test("stale → draft via operator_edited clears stale_reason", () => {
    const patch = diffPatch("stale", "draft", eventOf("operator_edited"), NOW);
    expect(patch.status).toBe("draft");
    expect(patch.stale_reason).toBeNull();
  });

  test("stale → reviewed via operator_approved clears stale_reason", () => {
    const patch = diffPatch("stale", "reviewed", eventOf("operator_approved"), NOW);
    expect(patch.stale_reason).toBeNull();
  });

  test("draft → draft (no stale boundary) does NOT touch stale_reason", () => {
    const patch = diffPatch("draft", "draft", eventOf("ai_completed"), NOW);
    expect("stale_reason" in patch).toBe(false);
  });

  test("reviewed → draft (not via stale) does NOT touch stale_reason", () => {
    const patch = diffPatch("reviewed", "draft", eventOf("operator_edited"), NOW);
    expect("stale_reason" in patch).toBe(false);
  });
});

describe("diffPatch — reviewed_at / reviewed_by management", () => {
  test("draft → reviewed via operator_approved sets reviewed_at + reviewed_by", () => {
    const patch = diffPatch("draft", "reviewed", eventOf("operator_approved"), NOW);
    expect(patch.reviewed_at).toBe(NOW);
    expect(patch.reviewed_by).toBe(USER_ID);
  });

  test("stale → reviewed via operator_approved sets reviewed_at + reviewed_by", () => {
    const patch = diffPatch("stale", "reviewed", eventOf("operator_approved"), NOW);
    expect(patch.reviewed_at).toBe(NOW);
    expect(patch.reviewed_by).toBe(USER_ID);
  });

  test("reviewed → reviewed via operator_approved updates reviewed_at + reviewed_by (idempotent re-approve)", () => {
    const patch = diffPatch("reviewed", "reviewed", eventOf("operator_approved"), NOW);
    expect(patch.reviewed_at).toBe(NOW);
    expect(patch.reviewed_by).toBe(USER_ID);
  });

  test("reviewed → draft via operator_edited clears reviewed_at + reviewed_by", () => {
    const patch = diffPatch("reviewed", "draft", eventOf("operator_edited"), NOW);
    expect(patch.reviewed_at).toBeNull();
    expect(patch.reviewed_by).toBeNull();
  });

  test("reviewed → stale via source_changed clears reviewed_at + reviewed_by", () => {
    const patch = diffPatch("reviewed", "stale", eventOf("source_changed"), NOW);
    expect(patch.reviewed_at).toBeNull();
    expect(patch.reviewed_by).toBeNull();
  });

  test("draft → draft does NOT touch reviewed_at", () => {
    const patch = diffPatch("draft", "draft", eventOf("ai_completed"), NOW);
    expect("reviewed_at" in patch).toBe(false);
    expect("reviewed_by" in patch).toBe(false);
  });
});

describe("diffPatch — always sets status + updated_at", () => {
  test("every patch has status", () => {
    const patch = diffPatch("draft", "draft", eventOf("ai_completed"), NOW);
    expect(patch.status).toBe("draft");
  });
  test("every patch has updated_at = now", () => {
    const patch = diffPatch("draft", "stale", eventOf("source_changed"), NOW);
    expect(patch.updated_at).toBe(NOW);
  });
});

// ────────────────────────────────────────────────────────────────────────
// validateTransition — error messages mention the offending event/status
// ────────────────────────────────────────────────────────────────────────

describe("validateTransition — rejected transitions return helpful errors", () => {
  test("approving a failed row mentions both 'operator_approved' and 'failed'", () => {
    const result = validateTransition("failed", eventOf("operator_approved"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("operator_approved");
      expect(result.error).toContain("failed");
    }
  });

  test("editing a failed row salvages it to draft (A6)", () => {
    const result = validateTransition("failed", eventOf("operator_edited"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.to).toBe("draft");
  });

  test("marking a failed row stale is rejected", () => {
    const result = validateTransition("failed", eventOf("manual_mark_stale"));
    expect(result.ok).toBe(false);
  });
});
