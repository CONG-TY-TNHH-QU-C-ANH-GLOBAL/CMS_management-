-- THG CMS — initial schema
-- D1 (SQLite). FK enforcement requires PRAGMA foreign_keys = ON per-connection (set in getDb()).

-- ============================================================
-- AUTH & AUDIT
-- ============================================================

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_login_at INTEGER
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT,
  at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_audit_at ON audit_log(at);
CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id);

-- ============================================================
-- MEDIA (R2 pointers)
-- ============================================================

CREATE TABLE media (
  id INTEGER PRIMARY KEY,
  r2_key TEXT NOT NULL UNIQUE,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  alt_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'archived')),
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_media_status ON media(status);

-- ============================================================
-- I18N — flat key/locale/value for UI microcopy
-- ============================================================

CREATE TABLE translations (
  key TEXT NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'vi', 'zh')),
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (key, locale)
);
CREATE INDEX idx_translations_locale ON translations(locale);

-- ============================================================
-- SITE SETTINGS (singleton, id=1)
-- ============================================================

CREATE TABLE site_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  brand_name TEXT NOT NULL DEFAULT 'THG Fulfill',
  logo_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  default_og_image_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  ga4_id TEXT,
  gtm_id TEXT,
  fb_pixel_id TEXT,
  tiktok_pixel_id TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  facebook_url TEXT,
  lead_form_destination TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================================
-- PAGES (route × locale, with SEO fields)
-- ============================================================

CREATE TABLE pages (
  id INTEGER PRIMARY KEY,
  route TEXT NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'vi', 'zh')),
  title TEXT NOT NULL,
  meta_description TEXT,
  canonical_url TEXT,
  og_image_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  json_ld_blob TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'live', 'archived')),
  published_at INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (route, locale)
);

CREATE TABLE homepage_blocks (
  id INTEGER PRIMARY KEY,
  page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'hero', 'trust', 'services_grid', 'about_video', 'marquee',
    'sellers', 'process', 'advantages', 'integrations',
    'testimonials', 'faq', 'contact'
  )),
  position INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'vi', 'zh'))
);
CREATE INDEX idx_homepage_blocks_page ON homepage_blocks(page_id, position);

-- ============================================================
-- SERVICES (3 service pages: thg-fulfill, thg-express, thg-warehouse)
-- ============================================================

CREATE TABLE services (
  id TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  icon TEXT,
  hero_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('draft', 'live', 'archived'))
);

CREATE TABLE services_i18n (
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'vi', 'zh')),
  name TEXT NOT NULL,
  tagline TEXT,
  hero_eyebrow TEXT,
  hero_title TEXT,
  hero_sub TEXT,
  cta_text TEXT,
  cta_url TEXT,
  body_md TEXT,
  PRIMARY KEY (service_id, locale)
);

CREATE TABLE service_bullets (
  id INTEGER PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'vi', 'zh')),
  position INTEGER NOT NULL,
  text TEXT NOT NULL
);
CREATE INDEX idx_service_bullets ON service_bullets(service_id, locale, position);

-- ============================================================
-- FAQS (scoped: home | service_id | page_id)
-- ============================================================

CREATE TABLE faqs (
  id INTEGER PRIMARY KEY,
  scope TEXT NOT NULL,
  position INTEGER NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'vi', 'zh')),
  question TEXT NOT NULL,
  answer TEXT NOT NULL
);
CREATE INDEX idx_faqs_scope ON faqs(scope, locale, position);

-- ============================================================
-- TESTIMONIALS
-- ============================================================

CREATE TABLE testimonials (
  id INTEGER PRIMARY KEY,
  position INTEGER NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'vi', 'zh')),
  quote TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_role TEXT,
  avatar_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL
);
CREATE INDEX idx_testimonials_locale ON testimonials(locale, position);

-- ============================================================
-- CONTACT LOCATIONS
-- ============================================================

CREATE TABLE contact_locations (
  id INTEGER PRIMARY KEY,
  position INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('office', 'warehouse', 'phone', 'email', 'website')),
  locale TEXT NOT NULL CHECK (locale IN ('en', 'vi', 'zh')),
  label TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  url TEXT,
  lang_class TEXT
);
CREATE INDEX idx_contact_locations ON contact_locations(locale, position);

-- ============================================================
-- INTEGRATIONS (marketplace logos: Etsy/Amazon/TikTok/eBay/Shopify/Woo)
-- ============================================================

CREATE TABLE integrations (
  id INTEGER PRIMARY KEY,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  logo_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  url TEXT,
  color_class TEXT
);

-- ============================================================
-- MARQUEE IMAGES (homepage rolling banner)
-- ============================================================

CREATE TABLE marquee_images (
  id INTEGER PRIMARY KEY,
  position INTEGER NOT NULL,
  media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE RESTRICT,
  alt_text TEXT NOT NULL
);

-- ============================================================
-- BLOG
-- ============================================================

CREATE TABLE blog_posts (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'vi', 'zh')),
  title TEXT NOT NULL,
  excerpt TEXT,
  thumbnail_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  category TEXT,
  published_date TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'live', 'archived')),
  seo_title TEXT,
  seo_description TEXT,
  og_image_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (slug, locale)
);
CREATE INDEX idx_blog_posts_status ON blog_posts(status, published_date);

CREATE TABLE blog_slides (
  id INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE RESTRICT,
  alt_text TEXT NOT NULL
);
CREATE INDEX idx_blog_slides_post ON blog_slides(post_id, position);

-- ============================================================
-- POLICIES & CAREERS
-- ============================================================

CREATE TABLE policies (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'vi', 'zh')),
  title TEXT NOT NULL,
  body_md TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (slug, locale)
);

CREATE TABLE careers_jobs (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'vi', 'zh')),
  title TEXT NOT NULL,
  body_md TEXT NOT NULL,
  location TEXT,
  employment_type TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'archived')),
  posted_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (slug, locale)
);

-- ============================================================
-- LEADS (form submissions replacing facebook.com CTA)
-- ============================================================

CREATE TABLE leads (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  message TEXT,
  source_page TEXT,
  locale TEXT CHECK (locale IN ('en', 'vi', 'zh')),
  ip TEXT,
  user_agent TEXT,
  utm_json TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'closed', 'spam')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_leads_created ON leads(created_at);
CREATE INDEX idx_leads_status ON leads(status);

-- ============================================================
-- NAVIGATION & CTA
-- ============================================================

CREATE TABLE navigation_links (
  id INTEGER PRIMARY KEY,
  position INTEGER NOT NULL,
  parent_id INTEGER REFERENCES navigation_links(id) ON DELETE CASCADE,
  label_key TEXT NOT NULL,
  href TEXT NOT NULL,
  target TEXT DEFAULT '_self' CHECK (target IN ('_self', '_blank')),
  locale_visibility TEXT NOT NULL DEFAULT 'all'
);
CREATE INDEX idx_nav_parent_pos ON navigation_links(parent_id, position);

CREATE TABLE cta_blocks (
  id INTEGER PRIMARY KEY,
  key TEXT NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'vi', 'zh')),
  label TEXT NOT NULL,
  href TEXT NOT NULL,
  variant TEXT NOT NULL DEFAULT 'primary',
  UNIQUE (key, locale)
);

-- ============================================================
-- PRICING (standalone module — JSON blob per table + version snapshots)
-- ============================================================

CREATE TABLE pricing_tables (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('weight_grid', 'meta_kv')),
  description TEXT,
  schema_json TEXT NOT NULL,
  data_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'live', 'archived')),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_pricing_status ON pricing_tables(status);

CREATE TABLE pricing_table_versions (
  id INTEGER PRIMARY KEY,
  table_id INTEGER NOT NULL REFERENCES pricing_tables(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  comment TEXT,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (table_id, version)
);
CREATE INDEX idx_pricing_versions_table ON pricing_table_versions(table_id, created_at);

-- ============================================================
-- Seed singleton row for site_settings
-- ============================================================

INSERT INTO site_settings (id, brand_name) VALUES (1, 'THG Fulfill');
