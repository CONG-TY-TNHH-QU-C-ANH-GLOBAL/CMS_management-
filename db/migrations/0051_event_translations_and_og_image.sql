-- 0051: Events join the AI localization pipeline, and gain their own OG image.
--
-- Mirrors blog_post_translations (0024) exactly, because `events` has the same
-- localization shape as `blog_posts`: one row per locale keyed by (slug, locale),
-- with `vi` as the canonical source. The translations table is the AI drafting +
-- review staging area; the public reader JOINs it at status='reviewed' and falls
-- back to a hand-written per-locale row, which is what getBlogPostForPublic does.
--
-- TRANSLATED: title, summary, body_md, location, role, seo_title, seo_description.
--   `location` is translated for the same reason contact_locations.address is —
--   "TikTok Office, Quận 1, TP.HCM" should read as an address in the reader's
--   language. `role` is prose too: "Diễn giả" must reach an English reader as
--   "Speaker", not as Vietnamese.
--
-- NOT TRANSLATED (stay on the source row): slug, event_date, end_date, url,
--   video_url, cover_media_id, og_image_id, status. These are identifiers, dates,
--   links and operator state — identical in every language, and translating a URL
--   would break it.

CREATE TABLE event_translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'zh')),  -- vi lives in events

  title TEXT NOT NULL,
  summary TEXT,
  body_md TEXT,
  location TEXT,
  role TEXT,
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
  UNIQUE (event_id, locale)
);
CREATE INDEX idx_event_trans_lookup ON event_translations(event_id, locale);
CREATE INDEX idx_event_trans_status ON event_translations(status);

-- Backfill: any en/zh event row written by hand before this pipeline existed
-- becomes a reviewed translation of its vi sibling, matched on slug. Same v4.2
-- semantics as 0024 — ai_generated_at / source_snapshot / reviewed_by / ai_model
-- / prompt_version stay NULL so analytics can isolate AI-generated rows.
--
-- source_hash is deliberately '' : it records the vi text the translation was
-- made FROM, and for a hand-written row that text is unknown. An empty hash can
-- never equal a real one, so the next source change marks these stale and they
-- get re-checked — which is the safe direction to be wrong in.
INSERT INTO event_translations (
  event_id, locale, title, summary, body_md, location, role,
  seo_title, seo_description,
  status, source_locale, source_hash, source_snapshot,
  ai_generated_at, ai_model, prompt_version, reviewed_at, reviewed_by
)
SELECT
  COALESCE(
    (SELECT vi.id FROM events vi WHERE vi.slug = e.slug AND vi.locale = 'vi' LIMIT 1),
    e.id
  ) AS event_id,
  e.locale, e.title, e.summary, e.body_md, e.location, e.role,
  e.seo_title, e.seo_description,
  'reviewed', 'vi', '', NULL,
  NULL, NULL, NULL, e.updated_at, NULL
FROM events e
WHERE e.locale IN ('en', 'zh');

-- Per-event social preview image. `blog_posts.og_image_id` (migration 0034) is
-- the precedent: the cover is sized for an in-page card, while a share card is
-- 1200x630 and usually wants the title burned in. Falls back to the cover when
-- unset, so leaving it NULL keeps today's behaviour.
ALTER TABLE events ADD COLUMN og_image_id INTEGER REFERENCES media(id) ON DELETE SET NULL;
