-- Service Content data plane — canonical PostgreSQL schema (POC).
-- Control plane (auth/RBAC/validation/workflow/audit/cache) stays in the CMS Worker; this schema is
-- the CANONICAL content store. No translated text lives in the core block table; every locale
-- (including VI) is a localization with append-only revisions and an explicit published pointer.

-- ── Locale governance ──────────────────────────────────────────────────────────────────────────
-- Adding a locale (ja/th/ko) is an INSERT here, never an ALTER of content tables.
CREATE TABLE content_locales (
  code           text PRIMARY KEY,
  native_name    text NOT NULL,
  direction      text NOT NULL DEFAULT 'ltr' CHECK (direction IN ('ltr', 'rtl')),
  is_active      boolean NOT NULL DEFAULT false,      -- served publicly
  is_source      boolean NOT NULL DEFAULT false,      -- may be an authoring source locale
  fallback_code  text REFERENCES content_locales (code),  -- explicit, nullable (default: none)
  rollout_status text NOT NULL DEFAULT 'planned'
                 CHECK (rollout_status IN ('planned', 'beta', 'ga', 'retired')),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── Page ownership (first-class) ─────────────────────────────────────────────────────────────────
CREATE TABLE service_content_pages (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug       text NOT NULL UNIQUE,
  status     text NOT NULL DEFAULT 'live' CHECK (status IN ('draft', 'live', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Core block — LOCALE-NEUTRAL only ─────────────────────────────────────────────────────────────
-- block_key is first-class identity; (page_id, kind, block_key) is the DB-enforced business key.
CREATE TABLE service_content_blocks (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  page_id     bigint NOT NULL REFERENCES service_content_pages (id) ON DELETE CASCADE,
  kind        text NOT NULL,                        -- validated by the code-owned kind registry on write
  block_key   text NOT NULL,
  position    integer NOT NULL,
  icon        text,
  core_config jsonb NOT NULL DEFAULT '{}'::jsonb,    -- locale-neutral structured config (typed by kind)
  is_active   boolean NOT NULL DEFAULT true,
  version     integer NOT NULL DEFAULT 1,            -- optimistic concurrency
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_block_identity UNIQUE (page_id, kind, block_key),
  CONSTRAINT ck_core_config_object CHECK (jsonb_typeof(core_config) = 'object')
);
CREATE INDEX idx_scb_page_kind_pos ON service_content_blocks (page_id, kind, position);

-- ── Localization identity — one stable row per (block, locale), incl. VI ─────────────────────────
CREATE TABLE service_content_localizations (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  block_id   bigint NOT NULL REFERENCES service_content_blocks (id) ON DELETE CASCADE,
  locale     text NOT NULL REFERENCES content_locales (code),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_localization UNIQUE (block_id, locale)
);

-- ── Revisions — IMMUTABLE, append-only content versions per localization ─────────────────────────
-- A new draft is a NEW revision; existing revisions are never mutated, so a draft edit cannot alter
-- currently published content (the publication pointer still references the old revision).
CREATE TABLE service_content_revisions (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  localization_id    bigint NOT NULL REFERENCES service_content_localizations (id) ON DELETE CASCADE,
  title              text,
  description        text,
  translated_payload jsonb NOT NULL DEFAULT '{}'::jsonb,  -- localized structured content (typed by kind)
  source_locale      text REFERENCES content_locales (code),  -- NULL for the source (VI) revision
  source_hash        text NOT NULL DEFAULT '',
  review_status      text NOT NULL DEFAULT 'draft'
                     CHECK (review_status IN ('draft', 'reviewed', 'stale', 'failed')),
  created_by         bigint,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_translated_payload_object CHECK (jsonb_typeof(translated_payload) = 'object')
);
CREATE INDEX idx_scr_localization ON service_content_revisions (localization_id, id DESC);

-- ── Publication pointer — the ONE live revision per localization ─────────────────────────────────
-- `reviewed` (a revision review_status) is NOT `published` (a pointer here). Publishing is an explicit,
-- atomic pointer move; draft/reviewed revisions that are not pointed to are never served.
CREATE TABLE service_content_publications (
  localization_id bigint PRIMARY KEY REFERENCES service_content_localizations (id) ON DELETE CASCADE,
  revision_id     bigint NOT NULL REFERENCES service_content_revisions (id),
  published_by    bigint,
  published_at    timestamptz NOT NULL DEFAULT now()
);
