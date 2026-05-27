-- 0024: AI-Assisted Localization Pipeline — extension to blog_posts
--
-- Mirrors careers_job_translations (migration 0023) and earlier translation
-- tables (0018/0020/0021). Translatable fields per blog post: title, excerpt,
-- category (when used as display label, not enum slug), seo_title,
-- seo_description.
--
-- NOT translated (kept on source row): slug, thumbnail_media_id,
-- published_date, status, og_image_id, author_id, updated_at. Slides
-- (blog_slides) are already per-locale via their own row pattern — defer
-- slide translation to a follow-up.

CREATE TABLE blog_post_translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  blog_post_id INTEGER NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'zh')),  -- vi lives in blog_posts

  title TEXT NOT NULL,
  excerpt TEXT,
  category TEXT,
  seo_title TEXT,
  seo_description TEXT,

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
  UNIQUE (blog_post_id, locale)
);
CREATE INDEX idx_blog_post_trans_lookup ON blog_post_translations(blog_post_id, locale);
CREATE INDEX idx_blog_post_trans_status ON blog_post_translations(status);

-- ============================================================
-- Data migration — existing en/zh rows → translations (status='reviewed')
-- ============================================================
-- Match en/zh rows to vi sibling by slug. Same v4.2 semantics as 0018:
-- ai_generated_at / source_snapshot / reviewed_by / ai_model / prompt_version
-- left NULL so analytics queries cleanly isolate AI-generated rows.

INSERT INTO blog_post_translations (
  blog_post_id, locale, title, excerpt, category, seo_title, seo_description,
  status, source_locale, source_hash, source_snapshot,
  ai_generated_at, ai_model, prompt_version, reviewed_at, reviewed_by
)
SELECT
  COALESCE(
    (SELECT vi.id FROM blog_posts vi
       WHERE vi.slug = bp.slug AND vi.locale = 'vi'
       LIMIT 1),
    bp.id
  )                            AS blog_post_id,
  bp.locale,
  bp.title,
  bp.excerpt,
  bp.category,
  bp.seo_title,
  bp.seo_description,
  'reviewed'                   AS status,
  'vi'                         AS source_locale,
  ''                           AS source_hash,
  NULL                         AS source_snapshot,
  NULL                         AS ai_generated_at,
  NULL                         AS ai_model,
  NULL                         AS prompt_version,
  unixepoch()                  AS reviewed_at,
  NULL                         AS reviewed_by
FROM blog_posts bp
WHERE bp.locale IN ('en', 'zh')
  AND NOT EXISTS (
    SELECT 1 FROM blog_post_translations t
     WHERE t.blog_post_id = COALESCE(
             (SELECT vi.id FROM blog_posts vi
                WHERE vi.slug = bp.slug AND vi.locale = 'vi'
                LIMIT 1),
             bp.id
           )
       AND t.locale = bp.locale
  );
