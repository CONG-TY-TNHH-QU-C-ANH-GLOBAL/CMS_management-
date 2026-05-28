// Auto-translate hook for VI source save handlers.
//
// Called from updateFaq / updateServiceBlock / updateTestimonial /
// updateHomepageBlock right after the VI source row commits. For each
// target locale that has NO translation row yet, fires translate() to
// create a draft. Existing translations are NOT overwritten — those
// rely on the separate onSourceChanged hook which only marks them stale
// (operator decides whether to re-translate via the 🤖 review modal).
//
// Why this design (per spec §11.7 + Rule 35):
//   - Rule 8: AI drafts NEVER reach landing without review (status='draft'
//     stays invisible to public API)
//   - Rule 12: NO auto-publish — operator must click Approve
//   - Rule 35: subsequent VI edits don't auto-re-translate (avoid OpenAI
//     cost storms + potential clobber of operator edits)
//
// Best-effort: if OPENAI_API_KEY is missing or translate() fails, we
// log + swallow. The source save itself already committed.

import { getDb } from "@/core/db/client";

import {
  translate,
  type TargetLocale,
  type TranslateEntityType,
} from "./translations.service";

const TARGET_LOCALES: TargetLocale[] = ["en", "zh"];

const FK_BY_ENTITY: Record<TranslateEntityType, { table: string; fk: string }> = {
  faq: { table: "faq_translations", fk: "faq_id" },
  service_block: { table: "service_block_translations", fk: "service_block_id" },
  testimonial: { table: "testimonial_translations", fk: "testimonial_id" },
  homepage_block: { table: "homepage_block_translations", fk: "homepage_block_id" },
  careers_job: { table: "careers_job_translations", fk: "careers_job_id" },
  blog_post: { table: "blog_post_translations", fk: "blog_post_id" },
  policy: { table: "policy_translations", fk: "policy_id" },
  contact_location: { table: "contact_location_translations", fk: "contact_location_id" },
  shipping_route: { table: "shipping_route_translations", fk: "shipping_route_id" },
};

/** For locales that have no translation row yet, fire translate() to
 *  create a draft. No-op for locales with an existing row (those are
 *  handled by the separate onSourceChanged hook → status='stale'). */
export async function autoTranslateMissingLocales(
  actorId: number,
  entityType: TranslateEntityType,
  entityId: number,
): Promise<void> {
  const cfg = FK_BY_ENTITY[entityType];

  const existing = await getDb()
    .prepare(`SELECT locale FROM ${cfg.table} WHERE ${cfg.fk} = ?`)
    .bind(entityId)
    .all<{ locale: string }>();
  const existingLocales = new Set((existing.results ?? []).map((r) => r.locale));
  const missing: TargetLocale[] = TARGET_LOCALES.filter((l) => !existingLocales.has(l));
  if (missing.length === 0) return;

  let apiKey: string | undefined;
  let baseUrl: string | undefined;
  try {
    const { env } = await import("cloudflare:workers");
    apiKey = env.OPENAI_API_KEY;
    baseUrl = env.OPENAI_BASE_URL;
  } catch {
    // Outside the worker runtime (e.g. unit tests) — skip silently.
    return;
  }
  if (!apiKey) {
    console.warn(`[auto-translate] OPENAI_API_KEY missing — skipping ${entityType}#${entityId}`);
    return;
  }

  try {
    await translate(
      apiKey,
      actorId,
      {
        entity_type: entityType,
        entity_id: entityId,
        target_locales: missing,
      },
      baseUrl,
    );
  } catch (err) {
    // Non-blocking (the source save already committed), but DO NOT fail
    // silently: record it in ai_translation_log so the operator/eng channel
    // can see that an auto-translate attempt failed and why. translate() logs
    // its own per-locale outcomes when it RUNS; this catch covers the case
    // where it THREW before logging (e.g. source-not-found, unexpected DB error).
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[auto-translate] ${entityType}#${entityId} failed`, err);
    try {
      const { insertAiTranslationLog } = await import("./translations.log.service");
      await insertAiTranslationLog({
        entity_type: entityType,
        entity_id: entityId,
        target_locales: missing,
        target_translation_ids: [],
        ai_model: "auto",
        prompt_version: "auto",
        tokens_in: 0,
        tokens_out: 0,
        estimated_cost_usd: 0,
        latency_ms: 0,
        status: "api_error",
        error_message: `auto-translate threw: ${message}`.slice(0, 1000),
        raw_response_json: null,
        requested_by: actorId,
        source_hash: "",
      });
    } catch {
      // logging is best-effort too
    }
  }
}
