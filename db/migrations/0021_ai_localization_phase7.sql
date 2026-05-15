-- 0021: AI-Assisted Localization Pipeline — Phase 7 (homepage_blocks)
--
-- Adds homepage_block_translations to the family started by migration 0018
-- (faq_translations) and extended in 0020 (service_block + testimonial).
--
-- homepage_blocks shape: id, page_id, kind, position, payload_json, locale.
-- Only payload_json is translatable — kind + position + page_id are
-- structural and locale-agnostic.
--
-- Migration semantics match prior translation tables (v4.2 in spec §8):
--   - VI rows stay in homepage_blocks as canonical source
--   - Existing en/zh rows move to homepage_block_translations
--     with status='reviewed', ai_generated_at=NULL (human-authored origin
--     preserved for analytics WHERE ai_generated_at IS NOT NULL filters)

CREATE TABLE homepage_block_translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  homepage_block_id INTEGER NOT NULL REFERENCES homepage_blocks(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'zh')),

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
  UNIQUE (homepage_block_id, locale)
);
CREATE INDEX idx_hb_trans_lookup ON homepage_block_translations(homepage_block_id, locale);
CREATE INDEX idx_hb_trans_status ON homepage_block_translations(status);

-- Data migration — existing en/zh rows → translations table.
-- Match by (page_id, kind, position) since homepage_blocks has 3 rows per
-- block (one per locale). FK points at the VI sibling.
INSERT INTO homepage_block_translations (
  homepage_block_id, locale, payload_json,
  status, source_locale, source_hash, source_snapshot,
  ai_generated_at, ai_model, prompt_version, reviewed_at, reviewed_by
)
SELECT
  COALESCE(
    (SELECT vi.id FROM homepage_blocks vi
       WHERE vi.page_id = hb.page_id AND vi.kind = hb.kind
         AND vi.position = hb.position AND vi.locale = 'vi'
       LIMIT 1),
    hb.id
  )                         AS homepage_block_id,
  hb.locale,
  hb.payload_json,
  'reviewed'                AS status,
  'vi'                      AS source_locale,
  ''                        AS source_hash,
  NULL                      AS source_snapshot,
  NULL                      AS ai_generated_at,
  NULL                      AS ai_model,
  NULL                      AS prompt_version,
  unixepoch()               AS reviewed_at,
  NULL                      AS reviewed_by
FROM homepage_blocks hb
WHERE hb.locale IN ('en', 'zh')
  AND NOT EXISTS (
    SELECT 1 FROM homepage_block_translations t
     WHERE t.homepage_block_id = COALESCE(
             (SELECT vi.id FROM homepage_blocks vi
                WHERE vi.page_id = hb.page_id AND vi.kind = hb.kind
                  AND vi.position = hb.position AND vi.locale = 'vi'
                LIMIT 1),
             hb.id
           )
       AND t.locale = hb.locale
  );
