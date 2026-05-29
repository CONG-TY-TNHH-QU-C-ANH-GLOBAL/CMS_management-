// Translation job engine — claims pending chunks, translates them, writes each
// result immediately, and finalizes a (job, locale) once all its chunks land.
//
// Driven from two places (both call runTranslationJobs):
//   - inline kick: createTranslationJob caller does ctx.waitUntil(runTranslationJobs(...))
//     so a freshly-created job starts within the same request — instant feedback.
//   - Cron Trigger (scheduled handler, every 1 min): the resume safety net. If
//     the inline pass crashed or timed out, the next cron pass reclaims the
//     lease-expired chunks and continues. This is what makes jobs durable.

import { getDb } from "@/core/db/client";
import { bumpCmsRev } from "@/core/db/mutations";

import {
  claimChunks,
  completeChunk,
  failChunk,
  getChunksForLocale,
  getJob,
  isJobTerminal,
  recomputeJobRollup,
  type JobLocale,
  type TranslationJobChunkRow,
  type TranslationJobRow,
} from "./translation-jobs.service";
import { translate, type TargetLocale, type TranslateEntityType } from "./translations.service";

// Review-gated JSON entities: a chunk = one (entity, locale) and is processed by
// calling the in-place translate() for that locale (which writes a `draft`
// <entity>_translations row + log/events/breaker). Shipping_route is the only
// "markdown" entity (chunks assemble into the source row, no review gate).
const JSON_ENTITY_TYPES = new Set<string>([
  "faq",
  "service_block",
  "testimonial",
  "homepage_block",
  "careers_job",
  "blog_post",
  "policy",
  "contact_location",
]);

const LOCALE_NAMES: Record<JobLocale, string> = {
  en: "English",
  vi: "Vietnamese",
  zh: "Chinese (Simplified)",
};

const DEFAULT_OPENAI_BASE = "https://api.openai.com/v1";
// Per-call ceiling. Chunks are ≤2500 source chars (~20-30s of verbose VI
// output); 90s leaves headroom without letting a wedged call hold the lease.
const CHUNK_TIMEOUT_MS = 90_000;
// How many chunks one pass claims + how many OpenAI calls run at once. Kept at
// one concurrency-wave so a browser-driven pump returns in ~one chunk-time
// (~25s) with visible progress; the cron pass loops runOnePass to clear more
// per minute. Small chunks keep 6 concurrent well under gpt-4o-mini limits.
const PASS_BATCH = 6;
const CONCURRENCY = 6;

interface EngineEnv {
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function translateChunk(
  apiKey: string,
  baseUrl: string,
  text: string,
  targetLocale: JobLocale,
): Promise<string> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), CHUNK_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              `You localize cross-border fulfilment content for THG Fulfill. Translate the ` +
              `user's markdown into ${LOCALE_NAMES[targetLocale]}. STRICT RULES:\n` +
              `- Preserve ALL markdown structure exactly: ## headings, ### subheadings, ` +
              `- bullets, [text](url) links, blank lines, 🚨/⚠/📌 callout prefixes.\n` +
              `- Keep verbatim (do NOT translate): numbers, prices, currency codes/symbols, ` +
              `country codes, dates, URLs, weights/dimensions, and proper nouns/acronyms ` +
              `(THG, Yunexpress, IOSS, USPS, DHL, Evri, VAT, GST, CE, APO/FPO, SKU, HS, VOEC).\n` +
              `- Translate naturally and professionally for a seller audience.\n` +
              `- Output ONLY the translated markdown — no preamble, no code fences.`,
          },
          { role: "user", content: text },
        ],
      }),
      signal: ctl.signal,
    });
    if (!res.ok) {
      let detail = `${res.status} ${res.statusText}`;
      try {
        const body = (await res.json()) as { error?: { message?: string } };
        if (body.error?.message) detail = body.error.message;
      } catch { /* ignore */ }
      throw new Error(`OpenAI ${res.status}: ${detail}`);
    }
    const body = (await res.json()) as { choices: Array<{ message: { content: string | null } }> };
    const out = body.choices[0]?.message?.content?.trim() ?? "";
    if (!out) throw new Error("OpenAI returned empty content");
    return out;
  } finally {
    clearTimeout(timer);
  }
}

// Write a fully-translated locale back into its entity row. Idempotent (plain
// UPDATE), so a re-finalize after a reclaim is harmless. Add new entity types
// here as they are wired into the job queue.
async function writeEntityLocale(
  entityType: string,
  entityRef: string,
  locale: JobLocale,
  text: string,
): Promise<boolean> {
  if (entityType === "shipping_route") {
    await getDb()
      .prepare(`UPDATE shipping_routes SET body_md = ?, updated_at = unixepoch() WHERE slug = ? AND locale = ?`)
      .bind(text, entityRef, locale)
      .run();
    return true;
  }
  console.error(`[translation-jobs] unknown entity_type "${entityType}" — cannot finalize`);
  return false;
}

// If every chunk of (job, locale) is done, assemble in seq order and write the
// entity. Returns true if it wrote (i.e. the locale just finished).
async function finalizeLocaleIfComplete(
  jobId: number,
  entityType: string,
  entityRef: string,
  locale: JobLocale,
): Promise<boolean> {
  const chunks = await getChunksForLocale(jobId, locale);
  if (chunks.length === 0 || !chunks.every((c) => c.status === "done")) return false;
  const assembled = chunks
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .map((c) => c.translated_text ?? "")
    .join("\n\n");
  return writeEntityLocale(entityType, entityRef, locale, assembled);
}

/** Run ONE pass: claim a batch, translate concurrently, persist each result,
 *  then finalize any locales that just completed + roll up affected jobs.
 *  Returns the number of chunks claimed (0 = nothing left to do this pass). */
export async function runOnePass(env: EngineEnv): Promise<number> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[translation-jobs] OPENAI_API_KEY not set — skipping pass");
    return 0;
  }
  const baseUrl = env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE;

  const claimed = await claimChunks(PASS_BATCH);
  if (claimed.length === 0) return 0;

  // Prefetch the jobs for the claimed chunks — entity_type drives the mode
  // (json-draft vs markdown), and JSON chunks need job.created_by for the actor.
  const jobs = new Map<number, TranslationJobRow>();
  for (const id of [...new Set(claimed.map((c) => c.job_id))]) {
    const j = await getJob(id);
    if (j) jobs.set(id, j);
  }

  await mapPool(claimed, CONCURRENCY, async (chunk: TranslationJobChunkRow) => {
    const job = jobs.get(chunk.job_id);
    try {
      if (job && JSON_ENTITY_TYPES.has(job.entity_type)) {
        await processJsonChunk(apiKey, baseUrl, job, chunk);
      } else {
        const out = await translateChunk(apiKey, baseUrl, chunk.source_text, chunk.target_locale);
        await completeChunk(chunk.id, out);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await failChunk(chunk.id, chunk.attempts, msg);
    }
  });

  // Finalize locales that just completed + roll up the affected jobs.
  const touched = new Map<number, Set<JobLocale>>();
  for (const c of claimed) {
    if (!touched.has(c.job_id)) touched.set(c.job_id, new Set());
    touched.get(c.job_id)!.add(c.target_locale);
  }
  for (const [jobId, locales] of touched) {
    const job = jobs.get(jobId) ?? (await getJob(jobId));
    if (!job) continue;
    // Markdown entities (shipping_route) assemble chunks into the source row.
    // JSON entities already wrote their `draft` <entity>_translations row inside
    // processJsonChunk — nothing to assemble, review gate intact.
    if (!JSON_ENTITY_TYPES.has(job.entity_type)) {
      for (const locale of locales) {
        await finalizeLocaleIfComplete(jobId, job.entity_type, job.entity_ref, locale);
      }
    }
    const rolled = await recomputeJobRollup(jobId);
    if (rolled && isJobTerminal(rolled.status)) {
      await bumpCmsRev();
    }
  }

  return claimed.length;
}

// Process one (entity, locale) chunk for a review-gated JSON entity by invoking
// the in-place translate() for that single locale. translate() writes a
// `draft`/`failed` <entity>_translations row + ai_translation_log + A9 events +
// A10 breaker — so the review gate holds (draft, NOT published). The chunk only
// records the per-locale outcome; there is no markdown to assemble/finalize.
async function processJsonChunk(
  apiKey: string,
  baseUrl: string | undefined,
  job: TranslationJobRow,
  chunk: TranslationJobChunkRow,
): Promise<void> {
  const entityId = Number(job.entity_ref);
  const actorId = job.created_by ?? 0;
  if (!Number.isFinite(entityId) || !actorId) {
    await failChunk(chunk.id, chunk.attempts, "json job missing valid entity_ref/created_by");
    return;
  }
  const result = await translate(
    apiKey,
    actorId,
    {
      entity_type: job.entity_type as TranslateEntityType,
      entity_id: entityId,
      target_locales: [chunk.target_locale as TargetLocale],
    },
    baseUrl,
  );
  const draft = result.drafts.find((d) => d.locale === chunk.target_locale);
  if (draft && draft.status === "draft") {
    await completeChunk(chunk.id, "draft");
  } else {
    await failChunk(chunk.id, chunk.attempts, draft?.error ?? "translate returned no draft");
  }
}

/** Loop passes until the queue is idle or the wall-clock budget is spent.
 *  Inline kick uses a short budget (return to the request quickly); the cron
 *  scheduled handler uses a longer one. */
export async function runTranslationJobs(env: EngineEnv, maxMs = 20_000): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const n = await runOnePass(env);
    if (n === 0) break;
  }
}
