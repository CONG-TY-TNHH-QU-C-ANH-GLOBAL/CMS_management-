// Translation job queue — durable, resumable async translation (Phase 2).
//
// A job owns N target locales × M source chunks. Chunks are translated and
// persisted one at a time, so a crash never loses completed work — the next
// pass (inline kick or 1-minute Cron) reclaims only what's still pending or
// whose claim lease expired. The engine (translation-jobs.engine.ts) drives
// processing + finalization; this module is the data layer.

import { getDb } from "@/core/db/client";

import { getEntityTableInfo, type TranslateEntityType } from "./translations.service";

export type JobLocale = "en" | "vi" | "zh";
export type JobStatus = "pending" | "running" | "completed" | "partial" | "failed";
export type ChunkStatus = "pending" | "running" | "done" | "failed";

export interface TranslationJobRow {
  id: number;
  entity_type: string;
  entity_ref: string;
  source_locale: JobLocale;
  target_locales: string; // JSON array
  status: JobStatus;
  total_chunks: number;
  done_chunks: number;
  failed_chunks: number;
  created_by: number | null;
  error: string | null;
  created_at: number;
  updated_at: number;
}

export interface TranslationJobChunkRow {
  id: number;
  job_id: number;
  target_locale: JobLocale;
  seq: number;
  source_text: string;
  translated_text: string | null;
  status: ChunkStatus;
  attempts: number;
  in_flight_until: number | null;
  error: string | null;
  created_at: number;
  updated_at: number;
}

// How long a claimed chunk is considered "owned" before another pass may
// reclaim it. Must exceed the worst-case single-chunk translate time (≤2500
// chars ≈ 20-30s) with headroom for retries inside one pass.
export const CLAIM_LEASE_SECONDS = 150;
// Give up on a chunk after this many attempts (then it's marked 'failed' and
// the job finalizes as 'partial'). Each claim bumps attempts.
export const MAX_CHUNK_ATTEMPTS = 5;
// Cap per chunk so even verbose Vietnamese output stays under the per-call
// OpenAI timeout. Mirrors the sync script + in-Worker translate.
const MAX_CHUNK_CHARS = 2500;

// ── Markdown chunker (shared shape with shipping.service / sync script) ──────
function hardSplitLine(line: string, cap: number): string[] {
  const out: string[] = [];
  let rest = line;
  const SENT = /[.!?。！？;；](\s|$)/g;
  while (rest.length > cap) {
    const window = rest.slice(0, cap);
    let cut = -1;
    SENT.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SENT.exec(window)) !== null) cut = m.index + 1;
    if (cut < cap * 0.5) {
      const sp = window.lastIndexOf(" ");
      cut = sp >= cap * 0.5 ? sp + 1 : cap;
    }
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut);
  }
  if (rest.trim()) out.push(rest.trim());
  return out;
}

/** Split markdown into ≤MAX_CHUNK_CHARS chunks at `## ` boundaries then line/
 *  hard-split, so no chunk can overrun the OpenAI timeout. */
export function splitMarkdownForJob(md: string): string[] {
  const sections: string[] = [];
  let cur: string[] = [];
  for (const line of md.split("\n")) {
    if (/^##\s+/.test(line) && cur.length > 0) {
      sections.push(cur.join("\n"));
      cur = [line];
    } else cur.push(line);
  }
  if (cur.length > 0) sections.push(cur.join("\n"));

  const chunks: string[] = [];
  for (const section of sections) {
    if (section.length <= MAX_CHUNK_CHARS) {
      if (section.trim()) chunks.push(section);
      continue;
    }
    let buf: string[] = [];
    let len = 0;
    const flush = () => {
      if (buf.join("").trim()) chunks.push(buf.join("\n"));
      buf = [];
      len = 0;
    };
    for (const line of section.split("\n")) {
      if (line.length > MAX_CHUNK_CHARS) {
        flush();
        for (const piece of hardSplitLine(line, MAX_CHUNK_CHARS)) chunks.push(piece);
        continue;
      }
      if (len + line.length + 1 > MAX_CHUNK_CHARS && buf.length > 0) flush();
      buf.push(line);
      len += line.length + 1;
    }
    flush();
  }
  return chunks.filter((c) => c.trim().length > 0);
}

// ── Job lifecycle ───────────────────────────────────────────────────────────

/** Create a job: split `sourceText` into chunks and persist one chunk row per
 *  (target locale, seq). Returns the new job id, or null if there is nothing to
 *  translate (empty source or no targets). */
export async function createTranslationJob(input: {
  entityType: string;
  entityRef: string;
  sourceLocale: JobLocale;
  sourceText: string;
  targetLocales: JobLocale[];
  createdBy: number | null;
}): Promise<{ jobId: number; totalChunks: number } | null> {
  const targets = input.targetLocales.filter((l) => l !== input.sourceLocale);
  const chunks = splitMarkdownForJob(input.sourceText.trim());
  if (targets.length === 0 || chunks.length === 0) return null;

  const totalChunks = targets.length * chunks.length;
  const db = getDb();
  const job = await db
    .prepare(
      `INSERT INTO translation_jobs (entity_type, entity_ref, source_locale, target_locales, status, total_chunks, created_by)
         VALUES (?, ?, ?, ?, 'pending', ?, ?) RETURNING id`,
    )
    .bind(
      input.entityType,
      input.entityRef,
      input.sourceLocale,
      JSON.stringify(targets),
      totalChunks,
      input.createdBy,
    )
    .first<{ id: number }>();
  if (!job) throw new Error("Không tạo được translation job.");

  // Insert chunk rows. D1 has no multi-row VALUES helper here, so batch the
  // prepared statements (one per chunk) — chunk counts are small (≤ ~75).
  const stmt = db.prepare(
    `INSERT INTO translation_job_chunks (job_id, target_locale, seq, source_text) VALUES (?, ?, ?, ?)`,
  );
  const batch = [];
  for (const locale of targets) {
    for (let seq = 0; seq < chunks.length; seq++) {
      batch.push(stmt.bind(job.id, locale, seq, chunks[seq]));
    }
  }
  await db.batch(batch);

  return { jobId: job.id, totalChunks };
}

/** Has a non-terminal (pending|running) job for this entity? Job-level dedup
 *  (A11) so repeated/concurrent bulk enqueues never double-translate an entity.
 *  We deliberately do NOT add a UNIQUE idempotency_key on chunks — terminal-job
 *  chunk history is retained, so a unique key would block legitimate re-enqueue. */
export async function hasActiveJob(entityType: string, entityRef: string): Promise<boolean> {
  const row = await getDb()
    .prepare(
      `SELECT 1 AS x FROM translation_jobs
        WHERE entity_type = ? AND entity_ref = ? AND status IN ('pending', 'running') LIMIT 1`,
    )
    .bind(entityType, entityRef)
    .first<{ x: number }>();
  return !!row;
}

/** Create a job for a review-gated JSON entity (faq/careers_job/…): ONE chunk
 *  per target locale (no markdown splitting — each chunk = one whole-entity
 *  translate for that locale, run by the engine via translate(), which writes a
 *  `draft` <entity>_translations row). Skips if an active job already exists. */
export async function createJsonEntityTranslationJob(input: {
  entityType: string;
  entityRef: string; // entity id as string
  targetLocales: JobLocale[];
  createdBy: number | null;
}): Promise<{ jobId: number; totalChunks: number } | { skipped: "active" | "no-targets" }> {
  const targets = input.targetLocales.filter((l) => l !== "vi");
  if (targets.length === 0) return { skipped: "no-targets" };
  if (await hasActiveJob(input.entityType, input.entityRef)) return { skipped: "active" };

  const db = getDb();
  const job = await db
    .prepare(
      `INSERT INTO translation_jobs (entity_type, entity_ref, source_locale, target_locales, status, total_chunks, created_by)
         VALUES (?, ?, 'vi', ?, 'pending', ?, ?) RETURNING id`,
    )
    .bind(input.entityType, input.entityRef, JSON.stringify(targets), targets.length, input.createdBy)
    .first<{ id: number }>();
  if (!job) throw new Error("Không tạo được translation job.");

  const stmt = db.prepare(
    `INSERT INTO translation_job_chunks (job_id, target_locale, seq, source_text) VALUES (?, ?, 0, ?)`,
  );
  await db.batch(
    targets.map((locale) => stmt.bind(job.id, locale, `${input.entityType}:${input.entityRef}`)),
  );
  return { jobId: job.id, totalChunks: targets.length };
}

/** Bulk-enqueue translation for every VI entity of `entityType` that has a
 *  MISSING/non-reviewed en or zh locale. Reviewed locales are skipped so we
 *  never clobber operator-approved content; entities with an active job reuse
 *  it. Returns the relevant job ids (for progress polling) + counts. */
export async function enqueueBulkTranslate(
  entityType: TranslateEntityType,
  createdBy: number | null,
): Promise<{ jobIds: number[]; chunkCount: number; entitiesQueued: number }> {
  const { sourceTable, translationsTable, sourceFkColumn } = getEntityTableInfo(entityType);
  const db = getDb();

  const srcRows = await db
    .prepare(`SELECT id FROM ${sourceTable} WHERE locale = 'vi'`)
    .all<{ id: number }>();
  const revRows = await db
    .prepare(`SELECT ${sourceFkColumn} AS fk, locale FROM ${translationsTable} WHERE status = 'reviewed'`)
    .all<{ fk: number; locale: string }>();

  const reviewedByEntity = new Map<number, Set<string>>();
  for (const r of revRows.results ?? []) {
    if (!reviewedByEntity.has(r.fk)) reviewedByEntity.set(r.fk, new Set());
    reviewedByEntity.get(r.fk)!.add(r.locale);
  }

  const ALL: JobLocale[] = ["en", "zh"];
  const jobIds: number[] = [];
  let chunkCount = 0;
  let entitiesQueued = 0;

  for (const row of srcRows.results ?? []) {
    const reviewed = reviewedByEntity.get(row.id) ?? new Set<string>();
    const targets = ALL.filter((l) => !reviewed.has(l));
    if (targets.length === 0) continue; // fully reviewed — nothing to do
    const ref = String(row.id);
    const active = await db
      .prepare(
        `SELECT id FROM translation_jobs WHERE entity_type = ? AND entity_ref = ? AND status IN ('pending', 'running') LIMIT 1`,
      )
      .bind(entityType, ref)
      .first<{ id: number }>();
    if (active) {
      jobIds.push(active.id);
      continue;
    }
    const created = await createJsonEntityTranslationJob({
      entityType,
      entityRef: ref,
      targetLocales: targets,
      createdBy,
    });
    if ("jobId" in created) {
      jobIds.push(created.jobId);
      chunkCount += created.totalChunks;
      entitiesQueued += 1;
    }
  }
  return { jobIds, chunkCount, entitiesQueued };
}

export interface BulkTranslateStatus {
  total: number;
  done: number;
  failed: number;
  pending: number;
}

/** Chunk rollup across a specific set of jobs (the batch the UI is tracking). */
export async function getBulkTranslateStatus(jobIds: number[]): Promise<BulkTranslateStatus> {
  if (jobIds.length === 0) return { total: 0, done: 0, failed: 0, pending: 0 };
  const placeholders = jobIds.map(() => "?").join(", ");
  const row = await getDb()
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
              SUM(CASE WHEN status IN ('pending', 'running') THEN 1 ELSE 0 END) AS pending
         FROM translation_job_chunks WHERE job_id IN (${placeholders})`,
    )
    .bind(...jobIds)
    .first<BulkTranslateStatus>();
  return row ?? { total: 0, done: 0, failed: 0, pending: 0 };
}

/** Atomically claim up to `limit` chunks that are pending OR whose running
 *  lease has expired (crashed worker). Sets status='running', bumps attempts,
 *  and stamps a fresh lease. Returns the claimed rows. */
export async function claimChunks(limit: number): Promise<TranslationJobChunkRow[]> {
  const res = await getDb()
    .prepare(
      `UPDATE translation_job_chunks
          SET status = 'running',
              attempts = attempts + 1,
              in_flight_until = unixepoch() + ?,
              updated_at = unixepoch()
        WHERE id IN (
          SELECT id FROM translation_job_chunks
           WHERE status = 'pending'
              OR (status = 'running' AND (in_flight_until IS NULL OR in_flight_until < unixepoch()))
           ORDER BY job_id, id
           LIMIT ?
        )
        RETURNING *`,
    )
    .bind(CLAIM_LEASE_SECONDS, limit)
    .all<TranslationJobChunkRow>();
  return res.results ?? [];
}

export async function completeChunk(id: number, translatedText: string): Promise<void> {
  await getDb()
    .prepare(
      `UPDATE translation_job_chunks
          SET status = 'done', translated_text = ?, in_flight_until = NULL, error = NULL, updated_at = unixepoch()
        WHERE id = ?`,
    )
    .bind(translatedText, id)
    .run();
}

/** Record a chunk failure. If it still has attempts left it goes back to
 *  'pending' (a later pass retries it); once attempts are exhausted it is
 *  marked 'failed' so the job can finalize as 'partial' instead of looping
 *  forever. */
export async function failChunk(id: number, attempts: number, error: string): Promise<void> {
  const terminal = attempts >= MAX_CHUNK_ATTEMPTS;
  await getDb()
    .prepare(
      `UPDATE translation_job_chunks
          SET status = ?, in_flight_until = NULL, error = ?, updated_at = unixepoch()
        WHERE id = ?`,
    )
    .bind(terminal ? "failed" : "pending", error.slice(0, 500), id)
    .run();
}

/** Recompute a job's done/failed counters + status from its chunk rows.
 *  Returns the fresh job row so the engine can decide whether to finalize. */
export async function recomputeJobRollup(jobId: number): Promise<TranslationJobRow | null> {
  const counts = await getDb()
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
         SUM(CASE WHEN status IN ('pending', 'running') THEN 1 ELSE 0 END) AS outstanding
       FROM translation_job_chunks WHERE job_id = ?`,
    )
    .bind(jobId)
    .first<{ total: number; done: number; failed: number; outstanding: number }>();
  if (!counts) return null;

  let status: JobStatus;
  if (counts.outstanding > 0) {
    status = counts.done > 0 || counts.failed > 0 ? "running" : "pending";
  } else if (counts.failed === 0) {
    status = "completed";
  } else if (counts.done === 0) {
    status = "failed";
  } else {
    status = "partial";
  }

  await getDb()
    .prepare(
      `UPDATE translation_jobs
          SET done_chunks = ?, failed_chunks = ?, status = ?, updated_at = unixepoch()
        WHERE id = ?`,
    )
    .bind(counts.done, counts.failed, status, jobId)
    .run();

  return getJob(jobId);
}

export async function getJob(id: number): Promise<TranslationJobRow | null> {
  const row = await getDb()
    .prepare(`SELECT * FROM translation_jobs WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<TranslationJobRow>();
  return row ?? null;
}

/** All chunk rows for a (job, locale), ordered by seq — the engine assembles
 *  these into the final body once every one is status='done'. */
export async function getChunksForLocale(
  jobId: number,
  locale: JobLocale,
): Promise<TranslationJobChunkRow[]> {
  const res = await getDb()
    .prepare(
      `SELECT * FROM translation_job_chunks
        WHERE job_id = ? AND target_locale = ? ORDER BY seq`,
    )
    .bind(jobId, locale)
    .all<TranslationJobChunkRow>();
  return res.results ?? [];
}

/** Most recent job for an entity (for the admin UI to resume polling). */
export async function getLatestJobForEntity(
  entityType: string,
  entityRef: string,
): Promise<TranslationJobRow | null> {
  const row = await getDb()
    .prepare(
      `SELECT * FROM translation_jobs
        WHERE entity_type = ? AND entity_ref = ?
        ORDER BY id DESC LIMIT 1`,
    )
    .bind(entityType, entityRef)
    .first<TranslationJobRow>();
  return row ?? null;
}

export function isJobTerminal(status: JobStatus): boolean {
  return status === "completed" || status === "partial" || status === "failed";
}
