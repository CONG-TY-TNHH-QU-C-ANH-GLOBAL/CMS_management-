-- Cluster-level role + privilege BOOTSTRAP for the `content` schema (Supabase/Postgres deployment).
-- NOT a transactional schema migration: roles are cluster objects. Run once by the MIGRATION OWNER
-- (a privileged role that is NOT the runtime login and NOT `postgres`) AFTER db/pg/migrations apply.
-- Rerunnable/idempotent. Contains NO committed password — credentials are injected out-of-band
-- (ALTER ROLE … WITH PASSWORD / connection secret) and rotated separately. The GRANT/REVOKE logic here
-- IS exercised by the PGlite POC via SET ROLE (PGlite honors roles + column privileges); real LOGIN
-- authentication, Supabase's anon/authenticated/service_role, and Hyperdrive are NOT (see db/pg/README).

-- ── Roles — least privilege: LOGIN only, NO SUPERUSER / CREATEROLE / CREATEDB / BYPASSRLS ─────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'thg_cms_runtime') THEN
    CREATE ROLE thg_cms_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'thg_content_importer') THEN
    CREATE ROLE thg_content_importer LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'thg_content_reader') THEN
    CREATE ROLE thg_content_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
  -- Dedicated NOLOGIN owner for the SECURITY DEFINER functions. It holds the privileges the functions
  -- need (revision INSERT, publication upsert); NO login, NO superuser/BYPASSRLS. The runtime/importer
  -- roles neither own nor can ALTER these functions — they only receive EXECUTE.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'thg_content_fn_owner') THEN
    CREATE ROLE thg_content_fn_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;

-- ── Lock down the schema: revoke the default PUBLIC access; grant nothing to Supabase's exposed
--    anon / authenticated / service_role. The editorial tables are reachable ONLY via the Worker. ──
REVOKE ALL ON SCHEMA content FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA content FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA content FROM PUBLIC;
-- (Intentionally NO GRANT … TO anon, authenticated, service_role — do not expose via PostgREST.)

-- ── Runtime role (the Worker): read everything; write structure via COLUMN-LEVEL grants so business
--    identity is not mutable; create/approve/publish revisions ONLY through the DB functions.
--    • Revisions: NO direct INSERT/UPDATE/DELETE. The runtime cannot fabricate a revision — it calls
--      create_draft_revision (status forced to 'draft') and approve_revision (copies an exact draft
--      into a 'reviewed' revision). This closes the review-provenance gap: an arbitrary already-
--      reviewed row is impossible for the runtime.
--    • Publications: NO direct write — EXECUTE on publish_revision is the only path.
--    • Identity columns (page slug; block page_id/kind/block_key; localization block_id/locale) are
--      omitted from every UPDATE grant, so the runtime cannot rewrite them. ─────────────────────────
GRANT USAGE ON SCHEMA content TO thg_cms_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA content TO thg_cms_runtime;
GRANT INSERT ON content.service_content_pages TO thg_cms_runtime;
GRANT UPDATE (status, updated_at) ON content.service_content_pages TO thg_cms_runtime;           -- NOT slug (stable identity)
GRANT INSERT ON content.service_content_blocks TO thg_cms_runtime;
GRANT UPDATE (position, icon, core_config, is_active, version, updated_at)
  ON content.service_content_blocks TO thg_cms_runtime;                                          -- NOT page_id/kind/block_key
GRANT INSERT ON content.service_content_localizations TO thg_cms_runtime;                        -- no UPDATE: block_id/locale are identity
-- (Intentionally NO INSERT/UPDATE/DELETE on service_content_revisions or service_content_publications.)
GRANT EXECUTE ON FUNCTION content.create_draft_revision(bigint, text, text, jsonb, text, text, bigint) TO thg_cms_runtime;
GRANT EXECUTE ON FUNCTION content.approve_revision(bigint, bigint, bigint) TO thg_cms_runtime;
GRANT EXECUTE ON FUNCTION content.publish_revision(bigint, bigint, bigint, bigint) TO thg_cms_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA content TO thg_cms_runtime;
ALTER ROLE thg_cms_runtime SET search_path = content;  -- pinned; unqualified names resolve to content

-- ── Importer role (manifest import): same discipline as runtime + locale governance INSERTs. It uses
--    the SAME function-only revision path (create_draft → approve → publish); NO direct revision
--    INSERT. A separate direct-INSERT capability for bulk historical import is added ONLY if/when a
--    backfill actually requires it (not in this PR), and is never granted to the runtime role. ───────
GRANT USAGE ON SCHEMA content TO thg_content_importer;
GRANT SELECT ON ALL TABLES IN SCHEMA content TO thg_content_importer;
GRANT INSERT, UPDATE ON content.content_locales TO thg_content_importer;                          -- locale governance
GRANT INSERT ON content.service_content_pages TO thg_content_importer;
GRANT UPDATE (status, updated_at) ON content.service_content_pages TO thg_content_importer;       -- NOT slug
GRANT INSERT ON content.service_content_blocks TO thg_content_importer;
GRANT UPDATE (position, icon, core_config, is_active, version, updated_at)
  ON content.service_content_blocks TO thg_content_importer;                                       -- NOT page_id/kind/block_key
GRANT INSERT ON content.service_content_localizations TO thg_content_importer;
-- (No direct revision/publication write — same as runtime.)
GRANT EXECUTE ON FUNCTION content.create_draft_revision(bigint, text, text, jsonb, text, text, bigint) TO thg_content_importer;
GRANT EXECUTE ON FUNCTION content.approve_revision(bigint, bigint, bigint) TO thg_content_importer;
GRANT EXECUTE ON FUNCTION content.publish_revision(bigint, bigint, bigint, bigint) TO thg_content_importer;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA content TO thg_content_importer;
ALTER ROLE thg_content_importer SET search_path = content;

-- ── Reader role (future edge/read projection or controlled functions): SELECT only. ───────────────
GRANT USAGE ON SCHEMA content TO thg_content_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA content TO thg_content_reader;
ALTER ROLE thg_content_reader SET search_path = content;

-- ── Function-owner role: owns the SECURITY DEFINER functions and holds EXACTLY the privileges they
--    need (revision INSERT for create/approve; publication upsert for publish; SELECT to read source
--    rows). Callers (runtime/importer) have EXECUTE only and cannot ALTER or own these functions.
--    Reassigning ownership here (not in the migration) keeps roles a cluster-level bootstrap concern. ─
GRANT USAGE ON SCHEMA content TO thg_content_fn_owner;
GRANT SELECT ON ALL TABLES IN SCHEMA content TO thg_content_fn_owner;
GRANT INSERT ON content.service_content_revisions TO thg_content_fn_owner;                        -- append-only (still no UPDATE/DELETE)
GRANT INSERT, UPDATE ON content.service_content_publications TO thg_content_fn_owner;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA content TO thg_content_fn_owner;
ALTER FUNCTION content.create_draft_revision(bigint, text, text, jsonb, text, text, bigint) OWNER TO thg_content_fn_owner;
ALTER FUNCTION content.approve_revision(bigint, bigint, bigint) OWNER TO thg_content_fn_owner;
ALTER FUNCTION content.publish_revision(bigint, bigint, bigint, bigint) OWNER TO thg_content_fn_owner;

-- Migration owner (schema DDL) is a SEPARATE privileged role used only for `migrate`, never the
-- runtime login. RLS policies (defense-in-depth on top of these privileges) are added once the exact
-- runtime claims are finalized — privileges above are the primary boundary, not RLS alone.
