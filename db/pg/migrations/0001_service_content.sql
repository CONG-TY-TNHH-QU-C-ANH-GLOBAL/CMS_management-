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
--    page_id uses ON DELETE RESTRICT: a page that owns blocks cannot be destructively deleted — it is
--    archived (status='archived'). This makes the historical boundary explicit rather than a side
--    effect of the revision-immutability trigger firing mid-cascade. ────────────────────────────────
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
--    mutated, so a draft edit cannot alter currently published content. The UNIQUE(localization_id,
--    id) exists solely as the target of the publication ownership FK below. ───────────────────────
CREATE TABLE content.service_content_revisions (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- ON DELETE RESTRICT: revisions are permanent history; a localization with revisions cannot be
  -- deleted (immutability by referential integrity, independent of the trigger below).
  localization_id    bigint NOT NULL REFERENCES content.service_content_localizations (id) ON DELETE RESTRICT,
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
--    localization_id is ON DELETE CASCADE because a publication is an EPHEMERAL pointer, not history:
--    if a localization were ever removed its pointer follows. In practice a localization with a
--    publication also has revisions (RESTRICT), so it cannot be deleted — the cascade never fires. ──
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

-- ── Publication eligibility, enforced in the DB (not just the TypeScript service) ─────────────────
--    The ONLY way the runtime moves a published pointer. SECURITY DEFINER so the runtime role needs
--    just EXECUTE (no direct INSERT/UPDATE on the publication table — see db/pg/bootstrap). It:
--      • re-checks ownership (revision belongs to the target localization — the composite FK also
--        guarantees this, this gives a clean error);
--      • rejects any revision whose review_status <> 'reviewed' (draft/stale/failed cannot publish);
--      • applies OPTIONAL optimistic concurrency: when p_expected_revision_id is provided it must equal
--        the current pointer, else a serialization_failure is raised (no lost update);
--      • atomically inserts-or-moves the single pointer and records the actor.
--    Pinned search_path, fully-qualified names, no dynamic SQL, no content/secret logging.
CREATE FUNCTION content.publish_revision(
  p_localization_id      bigint,
  p_revision_id          bigint,
  p_published_by         bigint DEFAULT NULL,
  p_expected_revision_id bigint DEFAULT NULL
) RETURNS bigint
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = content, pg_temp
AS $$
DECLARE
  v_owner   bigint;
  v_status  text;
  v_current bigint;
BEGIN
  SELECT localization_id, review_status
    INTO v_owner, v_status
    FROM content.service_content_revisions
   WHERE id = p_revision_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'publish rejected: revision % does not exist', p_revision_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_owner <> p_localization_id THEN
    RAISE EXCEPTION 'publish rejected: revision % belongs to localization %, not %',
      p_revision_id, v_owner, p_localization_id USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_status <> 'reviewed' THEN
    RAISE EXCEPTION 'publish rejected: revision % is "%", only reviewed revisions may be published',
      p_revision_id, v_status USING ERRCODE = 'check_violation';
  END IF;

  IF p_expected_revision_id IS NOT NULL THEN
    SELECT revision_id INTO v_current
      FROM content.service_content_publications
     WHERE localization_id = p_localization_id;
    IF v_current IS DISTINCT FROM p_expected_revision_id THEN
      RAISE EXCEPTION 'publish rejected: pointer moved (expected %, found %)',
        p_expected_revision_id, v_current USING ERRCODE = 'serialization_failure';
    END IF;
  END IF;

  INSERT INTO content.service_content_publications (localization_id, revision_id, published_by, published_at)
    VALUES (p_localization_id, p_revision_id, p_published_by, now())
    ON CONFLICT (localization_id)
      DO UPDATE SET revision_id  = EXCLUDED.revision_id,
                    published_by = EXCLUDED.published_by,
                    published_at = now();
  RETURN p_revision_id;
END;
$$;
REVOKE ALL ON FUNCTION content.publish_revision(bigint, bigint, bigint, bigint) FROM PUBLIC;
