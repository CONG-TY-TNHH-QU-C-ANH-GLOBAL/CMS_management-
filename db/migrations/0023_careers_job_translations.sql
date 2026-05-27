-- 0023: AI-Assisted Localization Pipeline — extension to careers_jobs
--
-- Adds careers_job_translations as a sibling translation table mirroring
-- the faq/service_block/testimonial/homepage_block pattern (migrations
-- 0018 / 0020 / 0021). Schema mirrors testimonial_translations exactly,
-- only the FK column and the localized field columns differ.
--
-- After this migration:
--   - careers_jobs keeps its 3-locale rows for now (rollback safety, same
--     as faq pattern from 0018). Existing en/zh rows are mirrored into
--     careers_job_translations with status='reviewed' so they're
--     immediately available to the public API JOIN that lands in a
--     follow-up — for now the public surface is unchanged.
--   - AI translate button on the VI tab will create draft rows here.
--
-- Translatable fields (10) — chosen for marketing/sales weight:
--   title, body_md, tagline, salary_note, experience, lead,
--   responsibilities_json, requirements_json, benefits_json, bonuses_json
--
-- NOT translated (kept on source row): slug, location, employment_type,
-- status, category, hot, badge, salary, salary_unit, deadline, position.
-- Location is borderline (Hanoi/Hà Nội) but currently rendered verbatim
-- on landing so keep it on the source until we add a proper locale-aware
-- city dictionary.
--
-- Spec reference: docs/ai-localization-spec.md §3.4 (deferred Phase 2/6 schema).

CREATE TABLE careers_job_translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  careers_job_id INTEGER NOT NULL REFERENCES careers_jobs(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'zh')),  -- vi lives in careers_jobs

  -- Localized fields. Mirror careers_jobs shape. JSON columns expect valid
  -- JSON; NOT NULL DEFAULT '{}' on objects, '[]' on arrays — matching the
  -- shape conventions used elsewhere in the table.
  title TEXT,
  body_md TEXT,
  tagline TEXT,
  salary_note TEXT,
  experience TEXT,
  lead TEXT,
  responsibilities_json TEXT NOT NULL DEFAULT '{}',
  requirements_json TEXT NOT NULL DEFAULT '[]',
  benefits_json TEXT NOT NULL DEFAULT '[]',
  bonuses_json TEXT NOT NULL DEFAULT '[]',

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
  UNIQUE (careers_job_id, locale)
);
CREATE INDEX idx_careers_job_trans_lookup ON careers_job_translations(careers_job_id, locale);
CREATE INDEX idx_careers_job_trans_status ON careers_job_translations(status);

-- ============================================================
-- Data migration — existing en/zh rows → translations (status='reviewed')
-- ============================================================
-- Match en/zh rows in careers_jobs to their vi sibling by `slug`. Same v4.2
-- semantics as 0018 / 0020 / 0021: preserve human-vs-AI distinction by
-- leaving ai_generated_at / source_snapshot / reviewed_by / ai_model /
-- prompt_version NULL. AI-translated rows populate them; humans don't.
--
-- If no vi sibling exists for an en/zh row, fall back to the row's own id
-- as careers_job_id (orphan-safe — same approach as service_block + testimonial
-- backfills). The operator can clean these up later if needed.

INSERT INTO careers_job_translations (
  careers_job_id, locale, title, body_md, tagline, salary_note, experience, lead,
  responsibilities_json, requirements_json, benefits_json, bonuses_json,
  status, source_locale, source_hash, source_snapshot,
  ai_generated_at, ai_model, prompt_version, reviewed_at, reviewed_by
)
SELECT
  COALESCE(
    (SELECT vi.id FROM careers_jobs vi
       WHERE vi.slug = cj.slug AND vi.locale = 'vi'
       LIMIT 1),
    cj.id
  )                                            AS careers_job_id,
  cj.locale,
  cj.title,
  cj.body_md,
  cj.tagline,
  cj.salary_note,
  cj.experience,
  cj.lead,
  COALESCE(cj.responsibilities_json, '{}')     AS responsibilities_json,
  COALESCE(cj.requirements_json, '[]')         AS requirements_json,
  COALESCE(cj.benefits_json, '[]')             AS benefits_json,
  COALESCE(cj.bonuses_json, '[]')              AS bonuses_json,
  'reviewed'                                   AS status,
  'vi'                                         AS source_locale,
  ''                                           AS source_hash,
  NULL                                         AS source_snapshot,
  NULL                                         AS ai_generated_at,
  NULL                                         AS ai_model,
  NULL                                         AS prompt_version,
  unixepoch()                                  AS reviewed_at,
  NULL                                         AS reviewed_by
FROM careers_jobs cj
WHERE cj.locale IN ('en', 'zh')
  AND NOT EXISTS (
    SELECT 1 FROM careers_job_translations t
     WHERE t.careers_job_id = COALESCE(
             (SELECT vi.id FROM careers_jobs vi
                WHERE vi.slug = cj.slug AND vi.locale = 'vi'
                LIMIT 1),
             cj.id
           )
       AND t.locale = cj.locale
  );
