-- Cluster-level role + privilege BOOTSTRAP for the `content` schema (Supabase/Postgres deployment).
-- NOT a transactional schema migration: roles are cluster objects. Run once by the MIGRATION OWNER
-- (a privileged role that is NOT the runtime login and NOT `postgres`) AFTER db/pg/migrations apply.
-- Rerunnable/idempotent. Contains NO committed password — credentials are injected out-of-band
-- (ALTER ROLE … WITH PASSWORD / connection secret) and rotated separately. NOT exercised by the
-- PGlite POC (PGlite has no cluster roles): PGlite proves the schema/constraints/triggers, NOT this.

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
END $$;

-- ── Lock down the schema: revoke the default PUBLIC access; grant nothing to Supabase's exposed
--    anon / authenticated / service_role. The editorial tables are reachable ONLY via the Worker. ──
REVOKE ALL ON SCHEMA content FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA content FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA content FROM PUBLIC;
-- (Intentionally NO GRANT … TO anon, authenticated, service_role — do not expose via PostgREST.)

-- ── Runtime role (the Worker): read everything; write structure + revisions + publication pointer.
--    Crucially: NO UPDATE and NO DELETE on revisions → published history is immutable by privilege
--    (the trigger in the migration is defense-in-depth). Structural removal is a soft-delete (UPDATE
--    is_active); there is no hard DELETE grant for the runtime. ─────────────────────────────────────
GRANT USAGE ON SCHEMA content TO thg_cms_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA content TO thg_cms_runtime;
GRANT INSERT, UPDATE ON content.service_content_pages TO thg_cms_runtime;
GRANT INSERT, UPDATE ON content.service_content_blocks TO thg_cms_runtime;
GRANT INSERT ON content.service_content_localizations TO thg_cms_runtime;
GRANT INSERT ON content.service_content_revisions TO thg_cms_runtime;          -- append only (no UPDATE/DELETE)
GRANT INSERT, UPDATE ON content.service_content_publications TO thg_cms_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA content TO thg_cms_runtime;
ALTER ROLE thg_cms_runtime SET search_path = content;  -- pinned; unqualified names resolve to content

-- ── Importer role (manifest import): same write surface as runtime + locale governance INSERTs.
--    Still append-only for revisions. ─────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA content TO thg_content_importer;
GRANT SELECT ON ALL TABLES IN SCHEMA content TO thg_content_importer;
GRANT INSERT, UPDATE ON content.content_locales TO thg_content_importer;
GRANT INSERT, UPDATE ON content.service_content_pages TO thg_content_importer;
GRANT INSERT, UPDATE ON content.service_content_blocks TO thg_content_importer;
GRANT INSERT ON content.service_content_localizations TO thg_content_importer;
GRANT INSERT ON content.service_content_revisions TO thg_content_importer;
GRANT INSERT, UPDATE ON content.service_content_publications TO thg_content_importer;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA content TO thg_content_importer;
ALTER ROLE thg_content_importer SET search_path = content;

-- ── Reader role (future edge/read projection or controlled functions): SELECT only. ───────────────
GRANT USAGE ON SCHEMA content TO thg_content_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA content TO thg_content_reader;
ALTER ROLE thg_content_reader SET search_path = content;

-- Migration owner (schema DDL) is a SEPARATE privileged role used only for `migrate`, never the
-- runtime login. RLS policies (defense-in-depth on top of these privileges) are added once the exact
-- runtime claims are finalized — privileges above are the primary boundary, not RLS alone.
