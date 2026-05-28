-- 0030: Translation observability + provider circuit breaker (Workstream A9/A10)
--
-- A9 — translation_job_events: append-only lifecycle log. ai_translation_log is
-- per-OpenAI-call and low-level; this captures the higher-level lifecycle
-- (translate_started / _succeeded / _failed for the in-place pipeline, plus
-- chunk_*/job_* for the async queue, plus provider_paused/_resumed) so a
-- production failure can be traced end-to-end per entity. event is free-form
-- TEXT so both the in-place and queue paths can emit their own vocab.
--
-- A10 — translation_provider_health: a circuit breaker. When OpenAI returns
-- sustained transient errors (429/quota/5xx/timeout), the breaker trips to
-- 'paused' with a cooldown so translate() short-circuits instead of hammering
-- the API. Auto-resumes (half-open) after paused_until.
--
-- Ordering note: independent of 0029 (translation_jobs) — both add new tables
-- with no cross-dependency, so apply order doesn't matter.

CREATE TABLE translation_job_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER,                       -- nullable: the in-place pipeline has no job
  entity_type TEXT NOT NULL,
  entity_ref TEXT NOT NULL,            -- entity id (as text) or slug
  locale TEXT,                         -- nullable for job-level events
  event TEXT NOT NULL,                 -- translate_started|translate_succeeded|translate_failed|chunk_*|job_*|provider_paused|provider_resumed
  detail_json TEXT,                    -- optional structured detail (error, attempt, model, status)
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_tje_entity ON translation_job_events(entity_type, entity_ref);
CREATE INDEX idx_tje_job ON translation_job_events(job_id);
CREATE INDEX idx_tje_created ON translation_job_events(created_at);

CREATE TABLE translation_provider_health (
  provider TEXT PRIMARY KEY,           -- 'openai'
  state TEXT NOT NULL DEFAULT 'healthy'
    CHECK (state IN ('healthy', 'degraded', 'paused')),
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  paused_until INTEGER,                -- when state='paused', resume at/after this epoch
  last_error TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT INTO translation_provider_health (provider) VALUES ('openai');
