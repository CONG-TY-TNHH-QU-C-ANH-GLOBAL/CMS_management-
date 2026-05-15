-- 0020: AI-Assisted Localization Pipeline — Phase 6 (sibling translation tables)
--
-- Adds two sibling tables to faq_translations (migration 0018):
--   • service_block_translations  — EN/ZH for service_blocks rows
--   • testimonial_translations    — EN/ZH for testimonials rows
--
-- Schema mirrors faq_translations exactly (status state machine, source_hash,
-- source_snapshot, ai_generated_at, in_flight_until, etc.). Only the FK column
-- and the localized payload columns differ per entity type.
--
-- After this migration:
--   - service_blocks keeps its 3-locale rows for now (rollback safety, same
--     as faq pattern from 0018). Public API filter shifts to JOIN later.
--   - Same for testimonials.
--
-- Spec reference: docs/ai-localization-spec.md §3.4 (deferred Phase 2/6 schema).
-- Rule 37 (2-week observation gate) was waived by operator on 2026-05-15 —
-- Phase 6 schema shipped immediately after Phase 1 POC reached production-ready.

-- ============================================================
-- 1. service_block_translations
-- ============================================================
CREATE TABLE service_block_translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_block_id INTEGER NOT NULL REFERENCES service_blocks(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'zh')),  -- vi lives in service_blocks

  -- Localized fields. Match service_blocks shape: title + description are
  -- straight text; payload_json is the kind-specific extras (tag, items,
  -- features, note, …) translated per-locale. Nullable mirrors source.
  title TEXT,
  description TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'reviewed', 'stale', 'failed')),
  stale_reason TEXT CHECK (stale_reason IN (
    'source_changed', 'prompt_changed', 'model_changed', 'manual_mark'
  )),
  source_locale TEXT NOT NULL DEFAULT 'vi',
  source_hash TEXT NOT NULL,
  source_snapshot TEXT,
  ai_generated_at INTEGER,
  ai_model TEXT,
  prompt_version TEXT,
  reviewed_at INTEGER,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  in_flight_until INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (service_block_id, locale)
);
CREATE INDEX idx_sb_trans_lookup ON service_block_translations(service_block_id, locale);
CREATE INDEX idx_sb_trans_status ON service_block_translations(status);

-- ============================================================
-- 2. testimonial_translations
-- ============================================================
-- Only `quote` and `author_role` are translatable. `author_name` and
-- `avatar_media_id` stay on the source row (proper-noun + binary asset).
CREATE TABLE testimonial_translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  testimonial_id INTEGER NOT NULL REFERENCES testimonials(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'zh')),

  quote TEXT NOT NULL,
  author_role TEXT,

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'reviewed', 'stale', 'failed')),
  stale_reason TEXT CHECK (stale_reason IN (
    'source_changed', 'prompt_changed', 'model_changed', 'manual_mark'
  )),
  source_locale TEXT NOT NULL DEFAULT 'vi',
  source_hash TEXT NOT NULL,
  source_snapshot TEXT,
  ai_generated_at INTEGER,
  ai_model TEXT,
  prompt_version TEXT,
  reviewed_at INTEGER,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  in_flight_until INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (testimonial_id, locale)
);
CREATE INDEX idx_test_trans_lookup ON testimonial_translations(testimonial_id, locale);
CREATE INDEX idx_test_trans_status ON testimonial_translations(status);

-- ============================================================
-- 3. Data migration — existing en/zh rows → *_translations (status='reviewed')
-- ============================================================
-- Same v4.2 semantics as migration 0018: preserve human-vs-AI distinction by
-- leaving ai_generated_at / source_snapshot / reviewed_by / ai_model /
-- prompt_version NULL. AI-translated rows populate them; humans don't.

-- service_blocks: match en/zh rows to vi sibling by (page_slug, kind, position)
INSERT INTO service_block_translations (
  service_block_id, locale, title, description, payload_json,
  status, source_locale, source_hash, source_snapshot,
  ai_generated_at, ai_model, prompt_version, reviewed_at, reviewed_by
)
SELECT
  COALESCE(
    (SELECT vi.id FROM service_blocks vi
       WHERE vi.page_slug = sb.page_slug AND vi.kind = sb.kind
         AND vi.position = sb.position AND vi.locale = 'vi'
       LIMIT 1),
    sb.id
  )                         AS service_block_id,
  sb.locale,
  sb.title,
  sb.description,
  sb.payload_json,
  'reviewed'                AS status,
  'vi'                      AS source_locale,
  ''                        AS source_hash,
  NULL                      AS source_snapshot,
  NULL                      AS ai_generated_at,
  NULL                      AS ai_model,
  NULL                      AS prompt_version,
  unixepoch()               AS reviewed_at,
  NULL                      AS reviewed_by
FROM service_blocks sb
WHERE sb.locale IN ('en', 'zh')
  AND NOT EXISTS (
    SELECT 1 FROM service_block_translations t
     WHERE t.service_block_id = COALESCE(
             (SELECT vi.id FROM service_blocks vi
                WHERE vi.page_slug = sb.page_slug AND vi.kind = sb.kind
                  AND vi.position = sb.position AND vi.locale = 'vi'
                LIMIT 1),
             sb.id
           )
       AND t.locale = sb.locale
  );

-- testimonials: match en/zh rows to vi sibling by position
INSERT INTO testimonial_translations (
  testimonial_id, locale, quote, author_role,
  status, source_locale, source_hash, source_snapshot,
  ai_generated_at, ai_model, prompt_version, reviewed_at, reviewed_by
)
SELECT
  COALESCE(
    (SELECT vi.id FROM testimonials vi
       WHERE vi.position = ts.position AND vi.locale = 'vi'
       LIMIT 1),
    ts.id
  )                         AS testimonial_id,
  ts.locale,
  ts.quote,
  ts.author_role,
  'reviewed'                AS status,
  'vi'                      AS source_locale,
  ''                        AS source_hash,
  NULL                      AS source_snapshot,
  NULL                      AS ai_generated_at,
  NULL                      AS ai_model,
  NULL                      AS prompt_version,
  unixepoch()               AS reviewed_at,
  NULL                      AS reviewed_by
FROM testimonials ts
WHERE ts.locale IN ('en', 'zh')
  AND NOT EXISTS (
    SELECT 1 FROM testimonial_translations t
     WHERE t.testimonial_id = COALESCE(
             (SELECT vi.id FROM testimonials vi
                WHERE vi.position = ts.position AND vi.locale = 'vi'
                LIMIT 1),
             ts.id
           )
       AND t.locale = ts.locale
  );
