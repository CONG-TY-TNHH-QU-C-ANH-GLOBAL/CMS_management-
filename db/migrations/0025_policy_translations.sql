-- 0025: AI-Assisted Localization Pipeline — extension to policies
--
-- Translatable fields per policy: title, body_md, summary, text_blocks_json.
-- NOT translated: slug, version, icon, mode, position, image_list_json
-- (URLs assumed global; if alt text needs localization, lift it out of
-- image_list_json into a dedicated field later).

CREATE TABLE policy_translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  policy_id INTEGER NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'zh')),  -- vi lives in policies

  title TEXT NOT NULL,
  body_md TEXT NOT NULL,
  summary TEXT,
  text_blocks_json TEXT,  -- nullable on source; mirror that

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
  UNIQUE (policy_id, locale)
);
CREATE INDEX idx_policy_trans_lookup ON policy_translations(policy_id, locale);
CREATE INDEX idx_policy_trans_status ON policy_translations(status);

INSERT INTO policy_translations (
  policy_id, locale, title, body_md, summary, text_blocks_json,
  status, source_locale, source_hash, source_snapshot,
  ai_generated_at, ai_model, prompt_version, reviewed_at, reviewed_by
)
SELECT
  COALESCE(
    (SELECT vi.id FROM policies vi
       WHERE vi.slug = p.slug AND vi.locale = 'vi'
       LIMIT 1),
    p.id
  )                            AS policy_id,
  p.locale,
  p.title,
  p.body_md,
  p.summary,
  p.text_blocks_json,
  'reviewed'                   AS status,
  'vi'                         AS source_locale,
  ''                           AS source_hash,
  NULL                         AS source_snapshot,
  NULL                         AS ai_generated_at,
  NULL                         AS ai_model,
  NULL                         AS prompt_version,
  unixepoch()                  AS reviewed_at,
  NULL                         AS reviewed_by
FROM policies p
WHERE p.locale IN ('en', 'zh')
  AND NOT EXISTS (
    SELECT 1 FROM policy_translations t
     WHERE t.policy_id = COALESCE(
             (SELECT vi.id FROM policies vi
                WHERE vi.slug = p.slug AND vi.locale = 'vi'
                LIMIT 1),
             p.id
           )
       AND t.locale = p.locale
  );
