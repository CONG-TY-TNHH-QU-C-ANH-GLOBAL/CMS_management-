-- 0027: AI-Assisted Localization Pipeline — extension to shipping_routes
--
-- Translatable fields (top-level only): title, body_md, notes_json.
-- NOT translated: slug, position, origin, destination, kind, status.
--
-- NESTED scope deferred: shipping_route_tables (caption + columns_json +
-- rows_json) needs its own translation table; nontrivial because rows
-- contain a mix of text labels and numeric values. Will land in a
-- follow-up once top-level shipping_routes localization is validated.

CREATE TABLE shipping_route_translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipping_route_id INTEGER NOT NULL REFERENCES shipping_routes(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'zh')),  -- vi lives in shipping_routes

  title TEXT NOT NULL,
  body_md TEXT,
  notes_json TEXT,  -- nullable on source; mirror that

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
  UNIQUE (shipping_route_id, locale)
);
CREATE INDEX idx_shipping_route_trans_lookup ON shipping_route_translations(shipping_route_id, locale);
CREATE INDEX idx_shipping_route_trans_status ON shipping_route_translations(status);

INSERT INTO shipping_route_translations (
  shipping_route_id, locale, title, body_md, notes_json,
  status, source_locale, source_hash, source_snapshot,
  ai_generated_at, ai_model, prompt_version, reviewed_at, reviewed_by
)
SELECT
  COALESCE(
    (SELECT vi.id FROM shipping_routes vi
       WHERE vi.slug = sr.slug AND vi.locale = 'vi'
       LIMIT 1),
    sr.id
  )                            AS shipping_route_id,
  sr.locale,
  sr.title,
  sr.body_md,
  sr.notes_json,
  'reviewed'                   AS status,
  'vi'                         AS source_locale,
  ''                           AS source_hash,
  NULL                         AS source_snapshot,
  NULL                         AS ai_generated_at,
  NULL                         AS ai_model,
  NULL                         AS prompt_version,
  unixepoch()                  AS reviewed_at,
  NULL                         AS reviewed_by
FROM shipping_routes sr
WHERE sr.locale IN ('en', 'zh')
  AND NOT EXISTS (
    SELECT 1 FROM shipping_route_translations t
     WHERE t.shipping_route_id = COALESCE(
             (SELECT vi.id FROM shipping_routes vi
                WHERE vi.slug = sr.slug AND vi.locale = 'vi'
                LIMIT 1),
             sr.id
           )
       AND t.locale = sr.locale
  );
