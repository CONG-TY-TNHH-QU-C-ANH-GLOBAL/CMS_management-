-- 0029: Translation job queue (Phase 2 — async, resumable translation)
--
-- The "Dịch" action used to translate synchronously inside one request: big
-- routes chunked + fired at OpenAI, and a crash/timeout lost ALL progress. This
-- introduces a durable job + per-chunk queue so translation becomes an
-- asynchronous, resumable workload:
--   - createTranslationJob() splits the source into ≤2500-char chunks (one set
--     per target locale) and persists them as status='pending'.
--   - The engine (run inline via ctx.waitUntil for an instant first pass, and
--     by a 1-minute Cron Trigger as the resume safety net) CLAIMS pending /
--     lease-expired chunks, translates them, and writes each result the moment
--     it lands. A crash leaves completed chunks on disk; the next pass only
--     redoes what's still pending.
--   - When every chunk of a (job, target_locale) is done, the finalizer
--     assembles them in `seq` order and writes the entity row (e.g.
--     shipping_routes.body_md), then bumps the CMS cache rev.
--
-- entity_type/entity_ref are a generic pointer (entity_ref is the slug). Only
-- 'shipping_route' is wired today; careers_job / blog_post / faq follow the
-- same shape in later PRs.

CREATE TABLE translation_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,              -- 'shipping_route' (more later)
  entity_ref TEXT NOT NULL,              -- slug of the entity
  source_locale TEXT NOT NULL CHECK (source_locale IN ('en', 'vi', 'zh')),
  target_locales TEXT NOT NULL,         -- JSON array, e.g. ["en","zh"]

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'partial', 'failed')),
  total_chunks INTEGER NOT NULL DEFAULT 0,
  done_chunks INTEGER NOT NULL DEFAULT 0,
  failed_chunks INTEGER NOT NULL DEFAULT 0,

  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_translation_jobs_status ON translation_jobs(status);
CREATE INDEX idx_translation_jobs_entity ON translation_jobs(entity_type, entity_ref);

CREATE TABLE translation_job_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES translation_jobs(id) ON DELETE CASCADE,
  target_locale TEXT NOT NULL CHECK (target_locale IN ('en', 'vi', 'zh')),
  seq INTEGER NOT NULL,                  -- order within (job, target_locale)
  source_text TEXT NOT NULL,
  translated_text TEXT,                  -- null until the chunk completes

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'done', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  -- Claim lease: a worker sets status='running' + in_flight_until = now + lease.
  -- A 'running' chunk whose lease has expired is reclaimable (the worker that
  -- held it crashed), which is what makes the job resumable.
  in_flight_until INTEGER,
  error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (job_id, target_locale, seq)
);
-- Claim query filters on (status, in_flight_until); job rollups filter on job_id.
CREATE INDEX idx_tjc_claim ON translation_job_chunks(status, in_flight_until);
CREATE INDEX idx_tjc_job ON translation_job_chunks(job_id);
