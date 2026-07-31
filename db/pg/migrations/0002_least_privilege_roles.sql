-- Least-privilege PostgreSQL roles for the Service Content data plane (Supabase/Postgres deployment).
-- Applied by the MIGRATION OWNER only. Not exercised by the PGlite POC harness (role DDL needs a real
-- cluster); this file is validated configuration to run against the Supabase project once provisioned.
--
-- Boundary: the CMS Worker connects as thg_cms_runtime (NOT a superuser, NOT the migration owner).
-- The browser never receives DB credentials — it calls the authenticated Worker API only. RLS +
-- privileges are defense-in-depth; the Worker's RBAC remains the primary authorization.

-- 1. Runtime role — what the Worker uses (read/write content, no DDL, no role management).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'thg_cms_runtime') THEN
    CREATE ROLE thg_cms_runtime LOGIN;  -- password/connection set out-of-band; never committed
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO thg_cms_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  content_locales, service_content_pages, service_content_blocks,
  service_content_localizations, service_content_revisions, service_content_publications
  TO thg_cms_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO thg_cms_runtime;

-- 2. Public read role — narrow SELECT for a future edge/read projection or controlled functions only.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'thg_content_reader') THEN
    CREATE ROLE thg_content_reader NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO thg_content_reader;
GRANT SELECT ON
  content_locales, service_content_pages, service_content_blocks,
  service_content_localizations, service_content_revisions, service_content_publications
  TO thg_content_reader;

-- 3. Importer role — bounded to content upserts for the manifest importer (no DDL, no role mgmt).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'thg_content_importer') THEN
    CREATE ROLE thg_content_importer LOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO thg_content_importer;
GRANT SELECT, INSERT, UPDATE ON
  service_content_pages, service_content_blocks, service_content_localizations,
  service_content_revisions, service_content_publications
  TO thg_content_importer;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO thg_content_importer;

-- Migration owner (schema DDL) is a SEPARATE role used only for `migrate` — never the runtime login.
-- Defense-in-depth RLS is added in a later migration once the exact runtime claims are finalized.
