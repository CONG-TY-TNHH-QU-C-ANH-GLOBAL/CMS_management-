// Lifecycle service for careers_job_translations. Mirrors testimonial /
// service-block / homepage-block — see those files for design notes. All
// status mutations go through applyTransition().
//
// Translatable fields per the careers_jobs shape (10):
//   - title                  (text)
//   - body_md                (markdown)
//   - tagline                (text)
//   - salary_note            (text)
//   - experience             (text)
//   - lead                   (text)
//   - responsibilities_json  (JSON: { "section": ["item1","item2"] })
//   - requirements_json      (JSON: ["item1","item2"])
//   - benefits_json          (JSON: [{i,t,d}])
//   - bonuses_json           (JSON: ["item1","item2"])

import { getDb } from "@/core/db/client";
import { auditLog } from "@/core/db/mutations";

import { applyTransition } from "./translations.transitions";
import { computeSourceHash } from "./translations.hash";
import type { TargetLocale } from "./translations.service";

export interface CareersJobTranslationRow {
  id: number;
  careers_job_id: number;
  locale: TargetLocale;
  title: string | null;
  body_md: string | null;
  tagline: string | null;
  salary_note: string | null;
  experience: string | null;
  lead: string | null;
  responsibilities_json: string;
  requirements_json: string;
  benefits_json: string;
  bonuses_json: string;
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

const CJ_TRANS_COLUMNS = `id, careers_job_id, locale, title, body_md, tagline,
  salary_note, experience, lead, responsibilities_json, requirements_json,
  benefits_json, bonuses_json, status, stale_reason, source_locale, source_hash,
  source_snapshot, ai_generated_at, ai_model, prompt_version, reviewed_at,
  reviewed_by, in_flight_until, created_at, updated_at`;

export async function listCareersJobTranslationsForId(
  careersJobId: number,
): Promise<CareersJobTranslationRow[]> {
  const result = await getDb()
    .prepare(
      `SELECT ${CJ_TRANS_COLUMNS} FROM careers_job_translations
        WHERE careers_job_id = ? ORDER BY locale`,
    )
    .bind(careersJobId)
    .all<CareersJobTranslationRow>();
  return result.results ?? [];
}

export async function listAllCareersJobTranslations(): Promise<CareersJobTranslationRow[]> {
  const result = await getDb()
    .prepare(
      `SELECT ${CJ_TRANS_COLUMNS} FROM careers_job_translations
        ORDER BY careers_job_id, locale`,
    )
    .all<CareersJobTranslationRow>();
  return result.results ?? [];
}

export async function approveCareersJobTranslation(
  actorId: number,
  translationId: number,
): Promise<{ from: string; to: string }> {
  return applyTransition("careers_job_translations", translationId, {
    kind: "operator_approved",
    userId: actorId,
  });
}

export interface CareersJobEditInput {
  id: number;
  title: string | null;
  body_md: string | null;
  tagline: string | null;
  salary_note: string | null;
  experience: string | null;
  lead: string | null;
  responsibilities_json: string;
  requirements_json: string;
  benefits_json: string;
  bonuses_json: string;
}

export async function editCareersJobTranslation(
  actorId: number,
  input: CareersJobEditInput,
): Promise<{ from: string; to: string }> {
  const now = Math.floor(Date.now() / 1000);
  const before = await getDb()
    .prepare(`SELECT ${CJ_TRANS_COLUMNS} FROM careers_job_translations WHERE id = ? LIMIT 1`)
    .bind(input.id)
    .first<CareersJobTranslationRow>();
  if (!before) {
    throw Object.assign(new Error("Translation không tồn tại."), { statusCode: 404 });
  }

  await getDb()
    .prepare(
      `UPDATE careers_job_translations
          SET title = ?, body_md = ?, tagline = ?, salary_note = ?, experience = ?,
              lead = ?, responsibilities_json = ?, requirements_json = ?,
              benefits_json = ?, bonuses_json = ?, updated_at = ?
        WHERE id = ?`,
    )
    .bind(
      input.title,
      input.body_md,
      input.tagline,
      input.salary_note,
      input.experience,
      input.lead,
      input.responsibilities_json,
      input.requirements_json,
      input.benefits_json,
      input.bonuses_json,
      now,
      input.id,
    )
    .run();

  await auditLog(
    actorId,
    "update",
    "careers_job_translations",
    input.id,
    {
      title: before.title,
      body_md: before.body_md,
      tagline: before.tagline,
      salary_note: before.salary_note,
      experience: before.experience,
      lead: before.lead,
      responsibilities_json: before.responsibilities_json,
      requirements_json: before.requirements_json,
      benefits_json: before.benefits_json,
      bonuses_json: before.bonuses_json,
    },
    {
      title: input.title,
      body_md: input.body_md,
      tagline: input.tagline,
      salary_note: input.salary_note,
      experience: input.experience,
      lead: input.lead,
      responsibilities_json: input.responsibilities_json,
      requirements_json: input.requirements_json,
      benefits_json: input.benefits_json,
      bonuses_json: input.bonuses_json,
    },
  );

  return applyTransition("careers_job_translations", input.id, {
    kind: "operator_edited",
    userId: actorId,
  });
}

export async function markCareersJobTranslationStale(
  actorId: number,
  translationId: number,
): Promise<{ from: string; to: string }> {
  return applyTransition("careers_job_translations", translationId, {
    kind: "manual_mark_stale",
    userId: actorId,
  });
}

export async function deleteCareersJobTranslation(actorId: number, id: number): Promise<void> {
  const before = await getDb()
    .prepare(`SELECT ${CJ_TRANS_COLUMNS} FROM careers_job_translations WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<CareersJobTranslationRow>();
  if (!before) return;
  await getDb()
    .prepare(`DELETE FROM careers_job_translations WHERE id = ?`)
    .bind(id)
    .run();
  await auditLog(actorId, "delete", "careers_job_translations", id, before, null);
}

/** Called from the careers_jobs update handler when the VI source row
 *  changes. Auto-fires `source_changed` on dependent translations whose
 *  hash differs (spec §3.3 + §11.7). */
export async function onCareersJobSourceChanged(
  careersJobId: number,
  newSource: {
    title: string | null;
    body_md: string | null;
    tagline: string | null;
    salary_note: string | null;
    experience: string | null;
    lead: string | null;
    responsibilities_json: string;
    requirements_json: string;
    benefits_json: string;
    bonuses_json: string;
  },
): Promise<{ stale_count: number }> {
  const newHash = await computeSourceHash({
    title: newSource.title ?? "",
    body_md: newSource.body_md ?? "",
    tagline: newSource.tagline ?? "",
    salary_note: newSource.salary_note ?? "",
    experience: newSource.experience ?? "",
    lead: newSource.lead ?? "",
    responsibilities_json: newSource.responsibilities_json,
    requirements_json: newSource.requirements_json,
    benefits_json: newSource.benefits_json,
    bonuses_json: newSource.bonuses_json,
  });
  const rows = await getDb()
    .prepare(
      `SELECT id, source_hash, status FROM careers_job_translations
        WHERE careers_job_id = ?`,
    )
    .bind(careersJobId)
    .all<{ id: number; source_hash: string; status: string }>();
  let staleCount = 0;
  for (const row of rows.results ?? []) {
    if (row.source_hash === newHash) continue;
    try {
      await applyTransition("careers_job_translations", row.id, { kind: "source_changed" });
      staleCount += 1;
    } catch {
      // failed row or other invalid transition — leave it as-is
    }
  }
  return { stale_count: staleCount };
}
