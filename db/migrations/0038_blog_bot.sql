-- 0038: Blog Auto-Bot (Phase 0 — config + run-log schema only).
--
-- Adds the two tables the AI-agent blogging bot needs. This migration is
-- ADDITIVE ONLY — it creates new tables and touches nothing that existing
-- production features read or write, so it is safe to apply to prod without
-- affecting translations, careers, community, telegram, etc.
--
-- The bot generates draft blog posts on a schedule (or on demand) and, per the
-- CMS moderation-first convention (docs/engineering/CMS_FOUNDATION.md Rule 12:
-- "AI components may propose; 'Verified by THG' stays operator-stamped"),
-- defaults to writing status='review'. A campaign may OPT IN to auto-publish
-- (autopublish=1), and even then a downstream verifier stage is the hard gate
-- (built in a later phase). Phase 0 ships only the schema + the admin config UI;
-- no engine writes to blog_bot_runs yet.
--
-- FK references are documentation only — D1 does not persist PRAGMA
-- foreign_keys; referential integrity is enforced application-side (repo
-- convention, see migration 0035/0037 headers).

-- ── Campaigns: one row per "bot" with its own rule set (edited in the CMS UI) ──
CREATE TABLE IF NOT EXISTS blog_bot_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,

  -- Schedule: daily run at run_time (HH:MM, 24h) interpreted in `timezone`.
  run_time TEXT NOT NULL DEFAULT '08:00',
  timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',

  -- Content targeting. `locale` is the language the bot WRITES the source post
  -- in (vi is the canonical source; en/zh drafts are auto-kicked downstream by
  -- the existing blog translation pipeline).
  locale TEXT NOT NULL DEFAULT 'vi' CHECK (locale IN ('en', 'vi', 'zh')),
  category TEXT,
  tone TEXT,

  -- How topics are chosen each run.
  --   'instruction' → the LLM reads instruction_md and picks/derives a topic.
  --   'seed_list'   → topics are drained from seed_topics_json (JSON string[]).
  topic_source TEXT NOT NULL DEFAULT 'instruction'
    CHECK (topic_source IN ('instruction', 'seed_list')),
  instruction_md TEXT,        -- natural-language command the operator writes
  seed_topics_json TEXT,      -- JSON array of seed topics (topic_source='seed_list')
  guidelines_md TEXT,         -- safety/brand rubric handed to the verifier stage

  -- Images.
  image_mode TEXT NOT NULL DEFAULT 'none'
    CHECK (image_mode IN ('none', 'ai_generate', 'stock')),
  image_style TEXT,

  -- Publishing policy.
  autopublish INTEGER NOT NULL DEFAULT 0,   -- opt-in; still gated by verifier
  model TEXT NOT NULL DEFAULT 'gpt-4o',
  max_per_day INTEGER NOT NULL DEFAULT 1,

  -- Runtime bookkeeping (written by the engine in later phases).
  last_run_at INTEGER,
  next_run_at INTEGER,

  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_blog_bot_campaigns_enabled
  ON blog_bot_campaigns(enabled, next_run_at);

-- ── Runs: durable queue + audit/status feed. One row per generation attempt. ──
-- Doubles as (a) the lease-based work queue drained by the cron engine
-- (in_flight_until claim lease, mirrors translation_job_chunks) and (b) the
-- run-history the admin UI renders.
CREATE TABLE IF NOT EXISTS blog_bot_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES blog_bot_campaigns(id) ON DELETE CASCADE,

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',      -- created, awaiting generation
    'generating',   -- LLM writing the article
    'imaging',      -- fetching/generating images
    'verifying',    -- moderation + LLM-judge
    'needs_review', -- saved as review draft, awaiting operator
    'published',    -- saved live (autopublish + verifier passed)
    'failed',       -- terminal error
    'skipped'       -- nothing to do (quota hit, no topic, dedupe)
  )),
  trigger TEXT NOT NULL DEFAULT 'schedule'
    CHECK (trigger IN ('schedule', 'manual')),

  topic TEXT,
  blog_post_id INTEGER REFERENCES blog_posts(id) ON DELETE SET NULL,
  blog_slug TEXT,
  verdict_json TEXT,          -- verifier output {safe, issues[], score}

  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  error TEXT,

  in_flight_until INTEGER,    -- claim lease (NULL = not claimed)
  attempts INTEGER NOT NULL DEFAULT 0,

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_blog_bot_runs_campaign
  ON blog_bot_runs(campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_bot_runs_claim
  ON blog_bot_runs(status, in_flight_until);
