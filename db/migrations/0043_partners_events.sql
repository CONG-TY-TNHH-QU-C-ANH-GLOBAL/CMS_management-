-- Two new content entities: business partners, and events THG took part in.
--
-- PARTNERS is deliberately NOT the existing `integrations` table. That one is
-- the marketplace/platform sync strip (Etsy, Amazon, TikTok Shop, eBay, Shopify,
-- WooCommerce) rendered under "Đồng bộ & Kết nối" — a technical integration
-- claim. A partner logo is a claim about a business relationship, which is a
-- different assertion about different companies, so it gets its own table rather
-- than a `kind` column that would make one admin screen mean two things.
--
-- Partners are NOT localized: the rows are company names and URLs. `integrations`
-- made the same call.
--
-- `status` exists because a partner logo is a public claim. Publishing one by
-- accident is worse than publishing a price by accident, and unlike
-- pricing_tables this entity ships with a working status control in its admin
-- screen — a draft here can actually be flipped to live.

CREATE TABLE partners (
  id INTEGER PRIMARY KEY,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  logo_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  url TEXT,
  -- Operator-defined grouping shown as a label ("Sàn TMĐT", "Vận hành", …).
  -- Free text on purpose: the partner mix changes faster than a CHECK would.
  tier TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'live')),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_partners_status_position ON partners(status, position);

-- EVENTS mirrors blog_posts' shape — one row per (slug, locale) — rather than
-- the newer base-row + *_translations sibling used by faq/testimonial. Events
-- are editorial content authored per locale exactly like posts are, and the
-- sibling pattern exists to carry AI translation review state that an event
-- record does not need. Reusing the blog shape also means the admin editor and
-- the public reader behave the way operators already expect from blog.
--
-- event_date is TEXT ISO-8601 (YYYY-MM-DD), matching blog_posts.published_date.
-- D1 has no date type and the existing code compares these as strings; an ISO
-- date sorts correctly under string comparison, which is why the format is fixed
-- rather than free.

CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'vi', 'zh')),
  title TEXT NOT NULL,
  summary TEXT,
  body_md TEXT,
  cover_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  -- The day the event happened. Required: an event record without a date cannot
  -- be placed on a timeline, which is the whole point of the section.
  event_date TEXT NOT NULL,
  -- Set only for multi-day events; NULL means single-day.
  end_date TEXT,
  location TEXT,
  -- How THG took part: "Nhà tài trợ", "Gian hàng", "Diễn giả", "Tham dự".
  role TEXT,
  -- External link (organiser page, press coverage).
  url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'live', 'archived')),
  seo_title TEXT,
  seo_description TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (slug, locale)
);
CREATE INDEX idx_events_locale_date ON events(locale, status, event_date DESC);

-- Photo gallery. Separate table rather than a JSON column so a photo can be
-- reordered and captioned without rewriting the event row, and so ON DELETE
-- SET NULL from media applies per photo.
CREATE TABLE event_photos (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  media_id INTEGER REFERENCES media(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  caption TEXT
);
CREATE INDEX idx_event_photos_event ON event_photos(event_id, position);
