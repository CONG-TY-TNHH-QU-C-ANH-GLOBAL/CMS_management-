-- 0062: Campaigns ("Chương trình") — seasonal / discount programs.
--
-- A campaign is published like a blog post (title, summary, markdown body,
-- cover, SEO) and additionally drives two landing placements:
--   - nav_featured  → a featured navbar item with a hover mega-menu built from
--                     menu_items_json;
--   - home_featured → the campaign highlighted on the home page.
-- Both toggles are OPERATOR INTENT. The public API reports the effective flag
-- (toggle on AND status live AND today in Asia/Ho_Chi_Minh <= end_date), so an
-- expired campaign drops out of the navbar without anyone editing it.
--
-- Localization: `vi` is the only source row (CHECK below). EN/ZH live in
-- campaign_translations, the AI drafting + review staging area that
-- event_translations (0051) established; the public reader serves a REVIEWED
-- translation and falls back to the VI row. `locale` is kept as a column so the
-- shared translation worker can load the source with its usual
-- `WHERE id = ? AND locale = 'vi'`.
--
-- Dates are TEXT ISO-8601 (YYYY-MM-DD) like events.event_date: they compare
-- correctly as strings, which is what the effective-flag check does.

CREATE TABLE campaigns (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'vi' CHECK (locale = 'vi'),
  title TEXT NOT NULL,
  summary TEXT,
  body_md TEXT,
  cover_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  og_image_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'live', 'archived')),
  position INTEGER NOT NULL DEFAULT 0,
  -- Internal path without the language prefix ("/christmas") or an absolute
  -- https URL. NULL means the landing links to /campaigns/:slug.
  landing_path TEXT,
  cta_label TEXT,
  nav_featured INTEGER NOT NULL DEFAULT 0 CHECK (nav_featured IN (0, 1)),
  nav_label TEXT,
  nav_badge TEXT,
  home_featured INTEGER NOT NULL DEFAULT 0 CHECK (home_featured IN (0, 1)),
  -- [{ "icon", "title", "subtitle", "href" }]. Parsed defensively by the reader:
  -- malformed JSON publishes as an empty menu rather than a 500.
  menu_items_json TEXT NOT NULL DEFAULT '[]',
  seo_title TEXT,
  seo_description TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX idx_campaigns_slug_locale ON campaigns(slug, locale);
CREATE INDEX idx_campaigns_status_position ON campaigns(status, position);

-- TRANSLATED: title, summary, body_md, cta_label, nav_label, menu_items_json
--   (titles/subtitles only — icon and href are read from the VI row),
--   seo_title, seo_description.
-- NOT TRANSLATED: slug, dates, status, position, landing_path, nav_badge,
--   toggles, media ids.
CREATE TABLE campaign_translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'zh')),

  title TEXT NOT NULL,
  summary TEXT,
  body_md TEXT,
  cta_label TEXT,
  nav_label TEXT,
  menu_items_json TEXT NOT NULL DEFAULT '[]',
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
  UNIQUE (campaign_id, locale)
);
CREATE INDEX idx_campaign_trans_status ON campaign_translations(status);

-- Seed: Christmas 2026. INSERT OR IGNORE against the unique (slug, locale)
-- index keeps a re-run harmless. No cover yet — marketing uploads one.
INSERT OR IGNORE INTO campaigns (
  slug, locale, title, summary, body_md, start_date, end_date, status, position,
  landing_path, cta_label, nav_featured, nav_label, nav_badge, home_featured,
  menu_items_json, seo_title, seo_description
) VALUES (
  'christmas-2026', 'vi', 'Christmas 2026 Collection',
  'Sản phẩm POD sẵn sàng cho mùa lễ',
  '## Mùa lễ 2026 cùng TH Group

Bộ sưu tập Giáng sinh gồm áo, quà tặng và đồ trang trí in theo yêu cầu, sản xuất và giao nhanh từ Mỹ.

- Mẫu bán chạy mùa lễ
- Sản phẩm mới cho Christmas 2026
- Ưu đãi dành cho seller',
  '2026-10-24', '2026-12-25', 'live', 0,
  '/christmas', 'Khám phá bộ sưu tập', 1, 'Christmas', 'NEW', 1,
  '[{"icon":"🎁","title":"Christmas Collection","subtitle":"Xem tất cả sản phẩm Giáng sinh","href":"/catalog/christmas"},{"icon":"🔥","title":"Best Seller","subtitle":"Sản phẩm bán tốt mùa lễ","href":"/catalog/best-seller"},{"icon":"🆕","title":"New Arrival","subtitle":"Sản phẩm mới","href":"/catalog/new-arrivals"},{"icon":"🇺🇸","title":"Fulfill tại Mỹ","subtitle":"Sản phẩm sản xuất/giao nhanh từ Mỹ","href":"/christmas#san-pham"},{"icon":"👕","title":"Apparel","subtitle":"Hoodie, Sweater, Jersey…","href":"/christmas#san-pham"},{"icon":"🎄","title":"Home & Gifts","subtitle":"Pillow, ornament, decoration…","href":"/christmas#san-pham"},{"icon":"🏷️","title":"Special Offers","subtitle":"Sản phẩm đang có ưu đãi","href":"/christmas#hot"},{"icon":"📒","title":"Christmas Catalog","subtitle":"Xem toàn bộ catalog","href":"/christmas#san-pham"}]',
  'Christmas 2026 Collection | TH Group',
  'Sản phẩm POD sẵn sàng cho mùa lễ: bộ sưu tập Giáng sinh, best seller, sản phẩm mới và fulfill tại Mỹ.'
);

-- Reviewed EN translation of the seed. source_hash '' follows 0051: the next
-- edit of the VI text marks it stale so it gets re-checked. The unique
-- (campaign_id, locale) constraint makes OR IGNORE idempotent.
INSERT OR IGNORE INTO campaign_translations (
  campaign_id, locale, title, summary, body_md, cta_label, nav_label,
  menu_items_json, seo_title, seo_description,
  status, source_locale, source_hash, reviewed_at
)
SELECT
  c.id, 'en', 'Christmas 2026 Collection',
  'POD products ready for the holiday season',
  '## Holiday season 2026 with TH Group

A Christmas collection of print-on-demand apparel, gifts and decorations, produced and shipped fast from the US.

- Holiday best sellers
- New arrivals for Christmas 2026
- Offers for sellers',
  'Explore Collection', 'Christmas',
  '[{"icon":"🎁","title":"Christmas Collection","subtitle":"See every Christmas product","href":"/catalog/christmas"},{"icon":"🔥","title":"Best Seller","subtitle":"Top sellers this holiday season","href":"/catalog/best-seller"},{"icon":"🆕","title":"New Arrival","subtitle":"New products","href":"/catalog/new-arrivals"},{"icon":"🇺🇸","title":"US Fulfillment","subtitle":"Made and shipped fast from the US","href":"/christmas#san-pham"},{"icon":"👕","title":"Apparel","subtitle":"Hoodie, Sweater, Jersey…","href":"/christmas#san-pham"},{"icon":"🎄","title":"Home & Gifts","subtitle":"Pillow, ornament, decoration…","href":"/christmas#san-pham"},{"icon":"🏷️","title":"Special Offers","subtitle":"Products on offer now","href":"/christmas#hot"},{"icon":"📒","title":"Christmas Catalog","subtitle":"Browse the full catalog","href":"/christmas#san-pham"}]',
  'Christmas 2026 Collection | TH Group',
  'POD products ready for the holiday season: Christmas collection, best sellers, new arrivals and US fulfillment.',
  'reviewed', 'vi', '', unixepoch()
FROM campaigns c
WHERE c.slug = 'christmas-2026' AND c.locale = 'vi';
