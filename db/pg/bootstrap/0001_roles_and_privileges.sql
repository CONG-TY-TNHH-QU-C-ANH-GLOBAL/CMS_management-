-- Cluster-level role + privilege BOOTSTRAP for the `content` schema (Supabase/Postgres deployment).
--
-- OPERATOR & EXECUTION ORDER:
--   Run by the MIGRATION OWNER — a dedicated, privileged, NON-superuser role that is NOT the runtime
--   login and NOT `postgres`/a Supabase superuser. Order:
--     1. apply db/pg/migrations/0001..0005 (schema, functions, triggers) AS the migration owner, so it
--        OWNS the functions;
--     2. apply THIS bootstrap AS the same migration owner.
--   The migration owner needs: CREATE on schema `content`, and the ability to GRANT the function-owner
--   role to itself (so it can reassign function ownership). It does NOT need superuser.
--
-- Rerunnable/idempotent. NO committed password — credentials are injected out-of-band (ALTER ROLE …
-- WITH PASSWORD / connection secret) and rotated separately. The GRANT/REVOKE logic here IS exercised
-- by the PGlite POC via SET ROLE (PGlite honors roles, column privileges, and SECURITY DEFINER
-- ownership); real LOGIN authentication, Supabase's anon/authenticated/service_role, and Hyperdrive are
-- NOT (see db/pg/README).

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
  -- Dedicated NOLOGIN owner for the SECURITY DEFINER functions. It holds EXACTLY the privileges the
  -- functions need; NO login, NO superuser/BYPASSRLS. Callers only receive EXECUTE.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'thg_content_fn_owner') THEN
    CREATE ROLE thg_content_fn_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;

-- ── Lock down the schema: revoke the default PUBLIC access; grant nothing to Supabase's exposed
--    anon / authenticated / service_role. The editorial tables are reachable ONLY via the Worker. ──
REVOKE ALL ON SCHEMA content FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA content FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA content FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA content FROM PUBLIC;
-- (Intentionally NO GRANT … TO anon, authenticated, service_role — do not expose via PostgREST.)

-- ── DENY-BY-DEFAULT for FUTURE objects the migration owner creates. We REVOKE the implicit PUBLIC
--    privileges on future tables/sequences/functions, but DO NOT auto-grant SELECT (or anything) to
--    runtime/importer/reader — every future migration must grant the specific objects it needs
--    explicitly. This keeps access deny-by-default as new tables are added. ─────────────────────────
ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA content REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA content REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA content REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- ── Runtime role (the Worker): read everything; write structure via COLUMN-LEVEL grants so business
--    identity is not mutable; create/approve/publish revisions ONLY through the DB functions.
--    • Revisions/publications: NO direct write — the functions are the only path (an arbitrary reviewed
--      row or pointer move is impossible for the runtime).
--    • Identity columns (page slug; block page_id/kind/block_key; localization block_id/locale) are
--      omitted from every UPDATE grant. `version` is also omitted — it is maintained by trigger (0005),
--      never assignable by the runtime. ───────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA content TO thg_cms_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA content TO thg_cms_runtime;
GRANT INSERT ON content.service_content_pages TO thg_cms_runtime;
GRANT UPDATE (status, updated_at) ON content.service_content_pages TO thg_cms_runtime;           -- NOT slug (stable identity)
GRANT INSERT ON content.service_content_blocks TO thg_cms_runtime;
GRANT UPDATE (position, icon, core_config, is_active, updated_at)
  ON content.service_content_blocks TO thg_cms_runtime;                                          -- NOT page_id/kind/block_key/version
GRANT INSERT ON content.service_content_localizations TO thg_cms_runtime;                        -- no UPDATE: block_id/locale are identity
-- (Intentionally NO INSERT/UPDATE/DELETE on service_content_revisions or service_content_publications.)
GRANT EXECUTE ON FUNCTION content.create_draft_revision(bigint, text, text, jsonb, text, text, bigint) TO thg_cms_runtime;
GRANT EXECUTE ON FUNCTION content.approve_revision(bigint, bigint, bigint) TO thg_cms_runtime;
GRANT EXECUTE ON FUNCTION content.publish_revision(bigint, bigint, bigint, bigint) TO thg_cms_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA content TO thg_cms_runtime;
ALTER ROLE thg_cms_runtime SET search_path = content;  -- pinned; unqualified names resolve to content

-- ── Importer role (manifest import): same discipline as runtime + locale governance INSERTs; the SAME
--    function-only revision path; NO direct revision INSERT; `version` also withheld. A separate direct-
--    INSERT capability for bulk historical import is added ONLY if/when a backfill needs it (not now),
--    and is never granted to the runtime role. ─────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA content TO thg_content_importer;
GRANT SELECT ON ALL TABLES IN SCHEMA content TO thg_content_importer;
GRANT INSERT, UPDATE ON content.content_locales TO thg_content_importer;                          -- locale governance
GRANT INSERT ON content.service_content_pages TO thg_content_importer;
GRANT UPDATE (status, updated_at) ON content.service_content_pages TO thg_content_importer;       -- NOT slug
GRANT INSERT ON content.service_content_blocks TO thg_content_importer;
GRANT UPDATE (position, icon, core_config, is_active, updated_at)
  ON content.service_content_blocks TO thg_content_importer;                                       -- NOT page_id/kind/block_key/version
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

-- ── Function-owner role: holds EXACTLY the privileges the SECURITY DEFINER functions need.
--    • revision INSERT (create/approve) — still no UPDATE/DELETE (append-only preserved for the owner);
--    • publication INSERT/UPDATE (publish upsert);
--    • localization UPDATE(created_at) — the MINIMUM privilege that permits `SELECT … FOR UPDATE` to
--      lock the localization row in publish_revision. The functions never mutate localization identity
--      (block_id/locale), and no other column is grantable for the lock. ─────────────────────────────
GRANT USAGE ON SCHEMA content TO thg_content_fn_owner;
GRANT SELECT ON ALL TABLES IN SCHEMA content TO thg_content_fn_owner;
GRANT INSERT ON content.service_content_revisions TO thg_content_fn_owner;                        -- append-only (no UPDATE/DELETE)
GRANT INSERT, UPDATE ON content.service_content_publications TO thg_content_fn_owner;
GRANT UPDATE (created_at) ON content.service_content_localizations TO thg_content_fn_owner;        -- row-lock enabler only
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA content TO thg_content_fn_owner;

-- ── Ownership transfer for the SECURITY DEFINER functions (non-superuser operator model). Requirements:
--    (a) the migration operator owns the freshly-created functions (it created them);
--    (b) the operator can SET ROLE to the target owner → grant temporary membership;
--    (c) the target owner has CREATE on the schema during transfer → grant temporarily.
--    Then transfer and REVOKE the temporary capabilities. Idempotent. ─────────────────────────────────
GRANT thg_content_fn_owner TO CURRENT_USER;                 -- (b) temporary membership for the operator
GRANT CREATE ON SCHEMA content TO thg_content_fn_owner;     -- (c) new owner can own objects in the schema
ALTER FUNCTION content.create_draft_revision(bigint, text, text, jsonb, text, text, bigint) OWNER TO thg_content_fn_owner;
ALTER FUNCTION content.approve_revision(bigint, bigint, bigint) OWNER TO thg_content_fn_owner;
ALTER FUNCTION content.publish_revision(bigint, bigint, bigint, bigint) OWNER TO thg_content_fn_owner;
REVOKE CREATE ON SCHEMA content FROM thg_content_fn_owner;  -- fn_owner needs no CREATE at runtime
REVOKE thg_content_fn_owner FROM CURRENT_USER;              -- drop the temporary membership

-- RLS policies (defense-in-depth on top of these privileges) are added once the exact runtime claims
-- are finalized — the privileges above are the primary boundary, not RLS alone.
