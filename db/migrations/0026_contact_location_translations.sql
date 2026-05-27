-- 0026: AI-Assisted Localization Pipeline — extension to contact_locations
--
-- Translatable fields: label, address. NOT translated: position, kind,
-- phone, url, lang_class (phone/URL are global contacts; lang_class is
-- a CSS hook, not content).
--
-- Identity: contact_locations rows are keyed by (position, kind, locale).
-- The translation FK references the VI row's id; backfill matches en/zh
-- rows to their vi sibling by (position, kind).

CREATE TABLE contact_location_translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_location_id INTEGER NOT NULL REFERENCES contact_locations(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'zh')),  -- vi lives in contact_locations

  label TEXT NOT NULL,
  address TEXT,

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
  UNIQUE (contact_location_id, locale)
);
CREATE INDEX idx_contact_loc_trans_lookup ON contact_location_translations(contact_location_id, locale);
CREATE INDEX idx_contact_loc_trans_status ON contact_location_translations(status);

INSERT INTO contact_location_translations (
  contact_location_id, locale, label, address,
  status, source_locale, source_hash, source_snapshot,
  ai_generated_at, ai_model, prompt_version, reviewed_at, reviewed_by
)
SELECT
  COALESCE(
    (SELECT vi.id FROM contact_locations vi
       WHERE vi.position = c.position AND vi.kind = c.kind AND vi.locale = 'vi'
       LIMIT 1),
    c.id
  )                            AS contact_location_id,
  c.locale,
  c.label,
  c.address,
  'reviewed'                   AS status,
  'vi'                         AS source_locale,
  ''                           AS source_hash,
  NULL                         AS source_snapshot,
  NULL                         AS ai_generated_at,
  NULL                         AS ai_model,
  NULL                         AS prompt_version,
  unixepoch()                  AS reviewed_at,
  NULL                         AS reviewed_by
FROM contact_locations c
WHERE c.locale IN ('en', 'zh')
  AND NOT EXISTS (
    SELECT 1 FROM contact_location_translations t
     WHERE t.contact_location_id = COALESCE(
             (SELECT vi.id FROM contact_locations vi
                WHERE vi.position = c.position AND vi.kind = c.kind AND vi.locale = 'vi'
                LIMIT 1),
             c.id
           )
       AND t.locale = c.locale
  );
