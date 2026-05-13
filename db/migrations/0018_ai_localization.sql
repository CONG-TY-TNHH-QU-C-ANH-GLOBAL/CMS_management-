-- 0018: AI-Assisted Localization Pipeline (Phase 1 — FAQ only)
--
-- Creates THREE tables for the localization workflow:
--   • faq_translations    — EN / ZH translation rows for VI source FAQs
--   • glossary            — branding/SEO term dictionary injected into AI prompts
--   • ai_translation_log  — per-call telemetry (tokens, cost, latency, raw response)
--
-- Plus a data migration: existing en/zh rows in `faqs` are moved out to
-- `faq_translations` with status='reviewed' (treat as human-authored, already
-- public). VI rows STAY in `faqs` as the canonical source.
--
-- Sibling translation tables (service_block_translations, testimonial_translations)
-- are NOT created here. They land in migration 0019 after FAQ workflow is
-- validated end-to-end per spec §3 + §8 Phase 5 checkpoint.
--
-- See: docs/ai-localization-spec.md (v4.2 FINAL).

-- ============================================================
-- 1. faq_translations
-- ============================================================
CREATE TABLE faq_translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  faq_id INTEGER NOT NULL REFERENCES faqs(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'zh')),  -- vi lives in faqs
  question TEXT NOT NULL,
  answer TEXT NOT NULL,

  -- Lifecycle (single source of truth — do NOT infer from reviewed_at + hash).
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'reviewed', 'stale', 'failed')),

  -- Why this row became stale. NULL unless status='stale'.
  stale_reason TEXT CHECK (stale_reason IN (
    'source_changed', 'prompt_changed', 'model_changed', 'manual_mark'
  )),

  -- Provenance / audit
  source_locale TEXT NOT NULL DEFAULT 'vi',
  source_hash TEXT NOT NULL,            -- sha256 of NORMALIZED source fields
  source_snapshot TEXT,                 -- VI text the AI translated from; NULL for migrated human rows
  ai_generated_at INTEGER,              -- NULL = human-authored; non-NULL = AI draft
  ai_model TEXT,                        -- 'gpt-4o-mini' | 'gpt-4o'
  prompt_version TEXT,                  -- 'v1' | 'v2-marketing' | ...

  -- Review state
  reviewed_at INTEGER,                  -- NULL until status='reviewed'
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,

  -- In-flight lock (v4.2) — set when a /translate call is in progress;
  -- TTL-style: callers compare against unixepoch() to decide if stale.
  in_flight_until INTEGER,

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),

  -- One translation per (faq_id, locale). If versioned drafts are ever needed
  -- (prompt v1 vs v2 side-by-side), drop this and add partial unique index.
  UNIQUE (faq_id, locale)
);
CREATE INDEX idx_faq_trans_lookup ON faq_translations(faq_id, locale);
CREATE INDEX idx_faq_trans_status ON faq_translations(status);

-- ============================================================
-- 2. glossary
-- ============================================================
CREATE TABLE glossary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  term_vi TEXT NOT NULL,
  term_en TEXT NOT NULL,
  term_zh TEXT NOT NULL,

  -- Grouping for admin UX + future prompt narrowing per entity_type.
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN (
    'shipping', 'warehouse', 'ecommerce', 'payments', 'marketing', 'brand', 'general'
  )),

  notes TEXT,                           -- "only for warehouse section", etc.
  priority INTEGER NOT NULL DEFAULT 0,  -- higher = matched first within same length tier

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX idx_glossary_vi ON glossary(term_vi);
CREATE INDEX idx_glossary_category ON glossary(category);
-- Matching policy (enforced in code, not SQL):
--   - Exact phrase match, case-sensitive
--   - No fuzzy / regex / stemming
--   - Whole-phrase substitution (sort by LENGTH(term_vi) DESC + priority DESC)

-- ============================================================
-- 3. ai_translation_log
-- ============================================================
CREATE TABLE ai_translation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,                -- 'faq' (Phase 1); 'service_block' | 'testimonial' later
  entity_id INTEGER NOT NULL,
  target_locales TEXT NOT NULL,             -- JSON array, e.g. '["en","zh"]'
  -- IDs of translation rows produced/updated by this call. JSON array.
  -- Empty '[]' if the call failed before any row was written. Not a real FK
  -- (D1 SQLite has no JSON FK) but IDs reference {entity_type}_translations.id.
  target_translation_ids TEXT NOT NULL DEFAULT '[]',
  ai_model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  tokens_in INTEGER NOT NULL,
  tokens_out INTEGER NOT NULL,
  -- USD cost stored at write time using THEN-current model pricing. Do NOT
  -- recompute from tokens at dashboard time — pricing changes over time.
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'parse_error', 'api_error', 'timeout')),
  error_message TEXT,
  -- Raw OpenAI completion, ALWAYS captured (success or failure). Critical when
  -- AI hallucinates a field, drops a key, or wraps JSON in markdown fences.
  raw_response_json TEXT,
  requested_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_hash TEXT NOT NULL,                -- normalized hash at translation time
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_ai_trans_log_entity ON ai_translation_log(entity_type, entity_id, created_at DESC);
CREATE INDEX idx_ai_trans_log_user ON ai_translation_log(requested_by, created_at DESC);
CREATE INDEX idx_ai_trans_log_status ON ai_translation_log(status, created_at DESC);

-- ============================================================
-- 4. Data migration: existing faqs en/zh → faq_translations
-- ============================================================
--
-- Semantics (v4.2): preserve the human-vs-AI distinction.
--   status            = 'reviewed'     (already public; treat as approved)
--   reviewed_at       = unixepoch()    (migration timestamp)
--   ai_generated_at   = NULL           (NOT AI-generated)
--   source_snapshot   = NULL           (no AI source to reference)
--   reviewed_by       = NULL           (historical; no auditor on record)
--   ai_model          = NULL
--   prompt_version    = NULL
--   source_hash       = '' (empty)     (no VI source to hash retroactively;
--                                       gets backfilled on next source edit)
--
-- After migration, the `faqs` table still contains all 3 locales — that's
-- intentional. Public reads gradually shift to `faq_translations` via the
-- new public API filter in Phase 4. We do NOT delete the en/zh rows from
-- `faqs` yet (rollback safety).

INSERT INTO faq_translations (
  faq_id, locale, question, answer, status, source_locale, source_hash,
  source_snapshot, ai_generated_at, ai_model, prompt_version,
  reviewed_at, reviewed_by
)
SELECT
  -- Match each non-VI row to its VI sibling by (scope, position). If no VI
  -- exists yet (legacy data), fall back to the row's own id so we don't lose data.
  COALESCE(
    (SELECT vi.id FROM faqs vi
       WHERE vi.scope = en.scope AND vi.position = en.position AND vi.locale = 'vi'
       LIMIT 1),
    en.id
  )                       AS faq_id,
  en.locale,
  en.question,
  en.answer,
  'reviewed'              AS status,
  'vi'                    AS source_locale,
  ''                      AS source_hash,
  NULL                    AS source_snapshot,
  NULL                    AS ai_generated_at,
  NULL                    AS ai_model,
  NULL                    AS prompt_version,
  unixepoch()             AS reviewed_at,
  NULL                    AS reviewed_by
FROM faqs en
WHERE en.locale IN ('en', 'zh')
  AND NOT EXISTS (
    -- Idempotency: skip rows already present in faq_translations (re-runs safe)
    SELECT 1 FROM faq_translations t
     WHERE t.faq_id = COALESCE(
             (SELECT vi.id FROM faqs vi
                WHERE vi.scope = en.scope AND vi.position = en.position AND vi.locale = 'vi'
                LIMIT 1),
             en.id
           )
       AND t.locale = en.locale
  );
