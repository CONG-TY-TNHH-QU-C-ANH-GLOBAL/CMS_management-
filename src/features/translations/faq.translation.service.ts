// Extension service functions for translation lifecycle outside of /translate.
// Lives separately from translations.service.ts to keep that file focused on
// the OpenAI worker flow. All status changes go through applyTransition().
//
// Functions:
//   - approveFaqTranslation     — operator-approved → reviewed
//   - editFaqTranslation        — operator-edited (saves new content + demotes status)
//   - markFaqTranslationStale   — manual mark-stale (operator spotted regression)
//   - onFaqSourceChanged        — internal: called from updateFaq when VI source edits
//   - listFaqTranslationsForId  — read for review UI

import { getDb } from "@/core/db/client";
import { auditLog } from "@/core/db/mutations";

import { applyTransition } from "./translations.transitions";
import { computeSourceHash } from "./translations.hash";
import type { TargetLocale } from "./translations.service";

export interface FaqTranslationRow {
  id: number;
  faq_id: number;
  locale: TargetLocale;
  question: string;
  answer: string;
  status: "draft" | "reviewed" | "stale" | "failed";
  stale_reason: string | null;
  source_locale: string;
  source_hash: string;
  source_snapshot: string | null;
  ai_generated_at: number | null;
  ai_model: string | null;
  prompt_version: string | null;
  reviewed_at: number | null;
  reviewed_by: number | null;
  in_flight_until: number | null;
  created_at: number;
  updated_at: number;
}

const FAQ_TRANS_COLUMNS = `id, faq_id, locale, question, answer, status, stale_reason,
  source_locale, source_hash, source_snapshot, ai_generated_at, ai_model, prompt_version,
  reviewed_at, reviewed_by, in_flight_until, created_at, updated_at`;

/** Read all translation rows for one source FAQ. Used by the review UI. */
export async function listFaqTranslationsForId(faqId: number): Promise<FaqTranslationRow[]> {
  const result = await getDb()
    .prepare(`SELECT ${FAQ_TRANS_COLUMNS} FROM faq_translations WHERE faq_id = ? ORDER BY locale`)
    .bind(faqId)
    .all<FaqTranslationRow>();
  return result.results ?? [];
}

/** Approve a translation row → status='reviewed' + reviewed_at + reviewed_by. */
export async function approveFaqTranslation(
  actorId: number,
  translationId: number,
): Promise<{ from: string; to: string }> {
  return applyTransition("faq_translations", translationId, {
    kind: "operator_approved",
    userId: actorId,
  });
}

/** Edit a translation row's content. Demotes status from `reviewed` → `draft`
 *  (operator must re-approve). For `draft` rows, status stays `draft` but
 *  the audit log captures the edit. */
export async function editFaqTranslation(
  actorId: number,
  input: { id: number; question: string; answer: string },
): Promise<{ from: string; to: string }> {
  const now = Math.floor(Date.now() / 1000);
  const before = await getDb()
    .prepare(`SELECT ${FAQ_TRANS_COLUMNS} FROM faq_translations WHERE id = ? LIMIT 1`)
    .bind(input.id)
    .first<FaqTranslationRow>();
  if (!before) throw Object.assign(new Error("Translation không tồn tại."), { statusCode: 404 });

  // Update content first (status mutation happens via transition service).
  await getDb()
    .prepare(`UPDATE faq_translations SET question = ?, answer = ?, updated_at = ? WHERE id = ?`)
    .bind(input.question, input.answer, now, input.id)
    .run();

  await auditLog(
    actorId,
    "update",
    "faq_translations",
    input.id,
    { question: before.question, answer: before.answer },
    { question: input.question, answer: input.answer },
  );

  // Now run the transition. For `failed` rows, operator_edited is rejected
  // by the matrix — caller should retry first. For everything else this
  // demotes to `draft`.
  return applyTransition("faq_translations", input.id, {
    kind: "operator_edited",
    userId: actorId,
  });
}

/** Operator-marked stale (e.g. spotted a quality regression). Status → stale,
 *  stale_reason = 'manual_mark'. */
export async function markFaqTranslationStale(
  actorId: number,
  translationId: number,
): Promise<{ from: string; to: string }> {
  return applyTransition("faq_translations", translationId, {
    kind: "manual_mark_stale",
    userId: actorId,
  });
}

/** Called from the FAQ update handler when the VI source row changes.
 *  Fires `source_changed` on every dependent translation whose source_hash
 *  differs from the new normalized hash. Spec §3.3 + §11.7 (only auto-fire
 *  event). */
export async function onFaqSourceChanged(
  faqId: number,
  newSource: { question: string; answer: string },
): Promise<{ stale_count: number }> {
  const newHash = await computeSourceHash({
    question: newSource.question,
    answer: newSource.answer,
  });
  const rows = await getDb()
    .prepare(`SELECT id, source_hash, status FROM faq_translations WHERE faq_id = ?`)
    .bind(faqId)
    .all<{ id: number; source_hash: string; status: string }>();
  let staleCount = 0;
  for (const row of rows.results ?? []) {
    if (row.source_hash === newHash) continue; // already up-to-date
    // applyTransition handles the matrix — `failed` rows reject source_changed
    // per spec §4.6, so we wrap in try/catch and silently skip.
    try {
      await applyTransition("faq_translations", row.id, { kind: "source_changed" });
      staleCount += 1;
    } catch {
      // failed row or other invalid transition — leave it as-is
    }
  }
  return { stale_count: staleCount };
}
