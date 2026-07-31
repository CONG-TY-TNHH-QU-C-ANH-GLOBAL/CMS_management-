-- Service Content data plane — SCHEMA, TYPES, TABLES, CONSTRAINTS (POC, not deployed).
-- One concern per migration file (see db/pg/README.md for the ordered set + runner). This file owns the
-- private `content` schema, its enum domains, tables, indexes, and referential/identity constraints.
-- Functions and triggers live in later, separately-owned files (0002–0005). Isolated in a PRIVATE
-- `content` schema (NOT Supabase's exposed `public`): editorial tables are reached only through the CMS
-- Worker. Objects are fully schema-qualified so the migration does not depend on search_path.

CREATE SCHEMA IF NOT EXISTS content;

-- ── Closed lifecycle domains as ENUM types — the DB enforces the allowed set (stronger than a text
--    column + CHECK IN-list) and each value is defined EXACTLY ONCE here. Domain-specific names keep
--    the lifecycles distinct: a page is `published`, a locale reaches `public` — no shared literal
--    across domains except a semantically-real 'draft' (page vs revision), which is not unified.
--    review_status is deliberately just draft|reviewed: an immutable revision only ever exists as a
--    submitted draft or its approved copy. Staleness is DERIVED (source hash/revision divergence) and
--    failure belongs to a future translation-attempt record — neither is a stored revision status.
CREATE TYPE content.locale_direction AS ENUM ('ltr', 'rtl');
CREATE TYPE content.locale_rollout   AS ENUM ('planned', 'preview', 'public', 'retired');
CREATE TYPE content.page_status       AS ENUM ('draft', 'published', 'archived');
CREATE TYPE content.review_status     AS ENUM ('draft', 'reviewed');

-- ── Locale governance ──────────────────────────────────────────────────────────────────────────
CREATE TABLE content.content_locales (
  code           text PRIMARY KEY,
  native_name    text NOT NULL,
  direction      content.locale_direction NOT NULL DEFAULT 'ltr',
  is_active      boolean NOT NULL DEFAULT false,
  is_source      boolean NOT NULL DEFAULT false,
  fallback_code  text REFERENCES content.content_locales (code),
  rollout_status content.locale_rollout NOT NULL DEFAULT 'planned',
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── Page ownership ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE content.service_content_pages (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug       text NOT NULL UNIQUE,
  status     content.page_status NOT NULL DEFAULT 'published',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Core block — LOCALE-NEUTRAL only; (page_id, kind, block_key) is DB-enforced identity ─────────
--    page_id uses ON DELETE RESTRICT: a page that owns blocks cannot be destructively deleted — it is
--    archived (status='archived'). `version` is an optimistic token maintained by trigger (0005); it is
--    NOT writable by the runtime/importer roles (see db/pg/bootstrap). ─────────────────────────────
CREATE TABLE content.service_content_blocks (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  page_id     bigint NOT NULL REFERENCES content.service_content_pages (id) ON DELETE RESTRICT,
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

-- ── Localization identity — one row per (block, locale), incl. VI. block_id is ON DELETE RESTRICT:
--    once a block has localizations it is disabled (is_active=false), never hard-deleted. ───────────
CREATE TABLE content.service_content_localizations (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  block_id   bigint NOT NULL REFERENCES content.service_content_blocks (id) ON DELETE RESTRICT,
  locale     text NOT NULL REFERENCES content.content_locales (code),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_localization UNIQUE (block_id, locale)
);

-- ── Revisions — IMMUTABLE, append-only. A new draft is a NEW row; existing revisions are never
--    mutated. UNIQUE(localization_id, id) is the target of the publication + review-lineage FKs below.
--    Review provenance: a `reviewed` revision is created by content.approve_revision (0003) from an
--    EXACT `draft`; reviewed_from_revision_id points at that draft (same localization, composite FK).
--    The DB forbids a `reviewed` row without lineage and a non-reviewed row with lineage. ────────────
CREATE TABLE content.service_content_revisions (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- ON DELETE RESTRICT: revisions are permanent history; a localization with revisions cannot be
  -- deleted (immutability by referential integrity, independent of the trigger in 0005).
  localization_id    bigint NOT NULL REFERENCES content.service_content_localizations (id) ON DELETE RESTRICT,
  title              text,
  description        text,
  translated_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_locale      text REFERENCES content.content_locales (code),
  source_hash        text NOT NULL DEFAULT '',
  review_status      content.review_status NOT NULL,   -- no column default: set explicitly by the workflow
  reviewed_from_revision_id bigint,                 -- set ONLY on a reviewed revision → its source draft
  reviewed_by        bigint,
  reviewed_at        timestamptz,
  created_by         bigint,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_translated_payload_object CHECK (jsonb_typeof(translated_payload) = 'object'),
  CONSTRAINT uq_revision_owner UNIQUE (localization_id, id),
  -- lineage exists IFF the revision is reviewed (draft/stale/failed must have none).
  CONSTRAINT ck_review_lineage CHECK ((review_status = 'reviewed') = (reviewed_from_revision_id IS NOT NULL)),
  -- the source draft must belong to the SAME localization (DB-enforced ownership, not service code).
  CONSTRAINT fk_reviewed_from_owner
    FOREIGN KEY (localization_id, reviewed_from_revision_id)
    REFERENCES content.service_content_revisions (localization_id, id)
);
CREATE INDEX idx_scr_localization ON content.service_content_revisions (localization_id, id DESC);
-- A given draft can be approved at most once (prevents duplicate reviewed revisions from one draft).
CREATE UNIQUE INDEX uq_reviewed_from ON content.service_content_revisions (reviewed_from_revision_id)
  WHERE reviewed_from_revision_id IS NOT NULL;

-- ── Publication pointer — the ONE live revision per localization. The COMPOSITE FK guarantees the
--    pointed-to revision BELONGS to this localization. localization_id is ON DELETE CASCADE because a
--    publication is an EPHEMERAL pointer, not history: in practice a localization with a publication
--    also has revisions (RESTRICT), so it cannot be deleted — the cascade never fires. ──────────────
CREATE TABLE content.service_content_publications (
  localization_id bigint PRIMARY KEY REFERENCES content.service_content_localizations (id) ON DELETE CASCADE,
  revision_id     bigint NOT NULL,
  published_by    bigint,
  published_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_publication_owns_revision
    FOREIGN KEY (localization_id, revision_id)
    REFERENCES content.service_content_revisions (localization_id, id)
);
