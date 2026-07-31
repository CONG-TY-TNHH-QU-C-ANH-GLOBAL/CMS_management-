-- Service Content data plane — canonical PostgreSQL schema (POC).
-- Isolated in a PRIVATE `content` schema (NOT Supabase's exposed `public`): editorial tables are
-- reached only through the CMS Worker, never PostgREST/Data API. Role grants + revocations live in
-- db/pg/bootstrap (cluster-level, not a transactional migration). No translated text in the core
-- block table; every locale (incl. VI) is a localization with append-only revisions and a published
-- pointer. Objects are fully schema-qualified so the migration does not depend on search_path.

CREATE SCHEMA IF NOT EXISTS content;

-- ── Locale governance ──────────────────────────────────────────────────────────────────────────
CREATE TABLE content.content_locales (
  code           text PRIMARY KEY,
  native_name    text NOT NULL,
  direction      text NOT NULL DEFAULT 'ltr' CHECK (direction IN ('ltr', 'rtl')),
  is_active      boolean NOT NULL DEFAULT false,
  is_source      boolean NOT NULL DEFAULT false,
  fallback_code  text REFERENCES content.content_locales (code),
  rollout_status text NOT NULL DEFAULT 'planned'
                 CHECK (rollout_status IN ('planned', 'beta', 'ga', 'retired')),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── Page ownership ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE content.service_content_pages (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug       text NOT NULL UNIQUE,
  status     text NOT NULL DEFAULT 'live' CHECK (status IN ('draft', 'live', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Core block — LOCALE-NEUTRAL only; (page_id, kind, block_key) is DB-enforced identity ─────────
CREATE TABLE content.service_content_blocks (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  page_id     bigint NOT NULL REFERENCES content.service_content_pages (id) ON DELETE CASCADE,
  kind        text NOT NULL,
  block_key   text NOT NULL,
  position    integer NOT NULL,
  icon        text,
  core_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active   boolean NOT NULL DEFAULT true,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_block_identity UNIQUE (page_id, kind, block_key),
  CONSTRAINT ck_core_config_object CHECK (jsonb_typeof(core_config) = 'object')
);
CREATE INDEX idx_scb_page_kind_pos ON content.service_content_blocks (page_id, kind, position);

-- ── Localization identity — one row per (block, locale), incl. VI ────────────────────────────────
CREATE TABLE content.service_content_localizations (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  block_id   bigint NOT NULL REFERENCES content.service_content_blocks (id) ON DELETE CASCADE,
  locale     text NOT NULL REFERENCES content.content_locales (code),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_localization UNIQUE (block_id, locale)
);

-- ── Revisions — IMMUTABLE, append-only. A new draft is a NEW row; existing revisions are never
--    mutated, so a draft edit cannot alter currently published content. The UNIQUE(localization_id,
--    id) exists solely as the target of the publication ownership FK below. ───────────────────────
CREATE TABLE content.service_content_revisions (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  localization_id    bigint NOT NULL REFERENCES content.service_content_localizations (id) ON DELETE CASCADE,
  title              text,
  description        text,
  translated_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_locale      text REFERENCES content.content_locales (code),
  source_hash        text NOT NULL DEFAULT '',
  review_status      text NOT NULL DEFAULT 'draft'
                     CHECK (review_status IN ('draft', 'reviewed', 'stale', 'failed')),
  created_by         bigint,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_translated_payload_object CHECK (jsonb_typeof(translated_payload) = 'object'),
  CONSTRAINT uq_revision_owner UNIQUE (localization_id, id)
);
CREATE INDEX idx_scr_localization ON content.service_content_revisions (localization_id, id DESC);

-- ── Publication pointer — the ONE live revision per localization. The COMPOSITE FK guarantees the
--    pointed-to revision BELONGS to this localization: (localization_id, revision_id) must match a
--    revision's (localization_id, id). A cross-localization pointer is impossible at the DB level. ──
CREATE TABLE content.service_content_publications (
  localization_id bigint PRIMARY KEY REFERENCES content.service_content_localizations (id) ON DELETE CASCADE,
  revision_id     bigint NOT NULL,
  published_by    bigint,
  published_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_publication_owns_revision
    FOREIGN KEY (localization_id, revision_id)
    REFERENCES content.service_content_revisions (localization_id, id)
);

-- ── Revision immutability (defense-in-depth alongside the runtime role's lack of UPDATE/DELETE).
--    Published history is append-only: the workflow inserts a revision and moves the pointer, never
--    mutates a prior revision. Structural block removal is a soft-delete (is_active=false); a rare
--    hard purge is a privileged maintenance operation that disables this trigger. ──────────────────
CREATE FUNCTION content.reject_revision_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'service_content_revisions are append-only (immutable): % rejected', TG_OP;
END;
$$;
CREATE TRIGGER trg_revisions_immutable
  BEFORE UPDATE OR DELETE ON content.service_content_revisions
  FOR EACH ROW EXECUTE FUNCTION content.reject_revision_mutation();
