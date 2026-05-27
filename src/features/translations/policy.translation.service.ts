// Lifecycle service for policy_translations. Mirrors blog-post / careers-job
// pattern.
//
// Translatable fields per the policies shape:
//   - title              (text, required)
//   - body_md            (markdown, required)
//   - summary            (text, nullable)
//   - text_blocks_json   (JSON, nullable — heading + content text array)

import { getDb } from "@/core/db/client";
import { auditLog } from "@/core/db/mutations";

import { applyTransition } from "./translations.transitions";
import { computeSourceHash } from "./translations.hash";
import type { TargetLocale } from "./translations.service";

export interface PolicyTranslationRow {
  id: number;
  policy_id: number;
  locale: TargetLocale;
  title: string;
  body_md: string;
  summary: string | null;
  text_blocks_json: string | null;
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

const POL_TRANS_COLUMNS = `id, policy_id, locale, title, body_md, summary,
  text_blocks_json, status, stale_reason, source_locale, source_hash,
  source_snapshot, ai_generated_at, ai_model, prompt_version, reviewed_at,
  reviewed_by, in_flight_until, created_at, updated_at`;

export async function listPolicyTranslationsForId(
  policyId: number,
): Promise<PolicyTranslationRow[]> {
  const result = await getDb()
    .prepare(
      `SELECT ${POL_TRANS_COLUMNS} FROM policy_translations
        WHERE policy_id = ? ORDER BY locale`,
    )
    .bind(policyId)
    .all<PolicyTranslationRow>();
  return result.results ?? [];
}

export async function listAllPolicyTranslations(): Promise<PolicyTranslationRow[]> {
  const result = await getDb()
    .prepare(
      `SELECT ${POL_TRANS_COLUMNS} FROM policy_translations
        ORDER BY policy_id, locale`,
    )
    .all<PolicyTranslationRow>();
  return result.results ?? [];
}

export async function approvePolicyTranslation(
  actorId: number,
  translationId: number,
): Promise<{ from: string; to: string }> {
  return applyTransition("policy_translations", translationId, {
    kind: "operator_approved",
    userId: actorId,
  });
}

export interface PolicyEditInput {
  id: number;
  title: string;
  body_md: string;
  summary: string | null;
  text_blocks_json: string | null;
}

export async function editPolicyTranslation(
  actorId: number,
  input: PolicyEditInput,
): Promise<{ from: string; to: string }> {
  const now = Math.floor(Date.now() / 1000);
  const before = await getDb()
    .prepare(`SELECT ${POL_TRANS_COLUMNS} FROM policy_translations WHERE id = ? LIMIT 1`)
    .bind(input.id)
    .first<PolicyTranslationRow>();
  if (!before) {
    throw Object.assign(new Error("Translation không tồn tại."), { statusCode: 404 });
  }

  await getDb()
    .prepare(
      `UPDATE policy_translations
          SET title = ?, body_md = ?, summary = ?, text_blocks_json = ?, updated_at = ?
        WHERE id = ?`,
    )
    .bind(input.title, input.body_md, input.summary, input.text_blocks_json, now, input.id)
    .run();

  await auditLog(
    actorId,
    "update",
    "policy_translations",
    input.id,
    {
      title: before.title,
      body_md: before.body_md,
      summary: before.summary,
      text_blocks_json: before.text_blocks_json,
    },
    {
      title: input.title,
      body_md: input.body_md,
      summary: input.summary,
      text_blocks_json: input.text_blocks_json,
    },
  );

  return applyTransition("policy_translations", input.id, {
    kind: "operator_edited",
    userId: actorId,
  });
}

export async function markPolicyTranslationStale(
  actorId: number,
  translationId: number,
): Promise<{ from: string; to: string }> {
  return applyTransition("policy_translations", translationId, {
    kind: "manual_mark_stale",
    userId: actorId,
  });
}

export async function deletePolicyTranslation(actorId: number, id: number): Promise<void> {
  const before = await getDb()
    .prepare(`SELECT ${POL_TRANS_COLUMNS} FROM policy_translations WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<PolicyTranslationRow>();
  if (!before) return;
  await getDb()
    .prepare(`DELETE FROM policy_translations WHERE id = ?`)
    .bind(id)
    .run();
  await auditLog(actorId, "delete", "policy_translations", id, before, null);
}

export async function onPolicySourceChanged(
  policyId: number,
  newSource: {
    title: string;
    body_md: string;
    summary: string | null;
    text_blocks_json: string | null;
  },
): Promise<{ stale_count: number }> {
  const newHash = await computeSourceHash({
    title: newSource.title,
    body_md: newSource.body_md,
    summary: newSource.summary ?? "",
    text_blocks_json: newSource.text_blocks_json ?? "",
  });
  const rows = await getDb()
    .prepare(
      `SELECT id, source_hash, status FROM policy_translations
        WHERE policy_id = ?`,
    )
    .bind(policyId)
    .all<{ id: number; source_hash: string; status: string }>();
  let staleCount = 0;
  for (const row of rows.results ?? []) {
    if (row.source_hash === newHash) continue;
    try {
      await applyTransition("policy_translations", row.id, { kind: "source_changed" });
      staleCount += 1;
    } catch {
      // failed row or other invalid transition — leave it as-is
    }
  }
  return { stale_count: staleCount };
}
