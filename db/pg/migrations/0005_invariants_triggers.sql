-- Invariants enforced by triggers (defense-in-depth on top of table constraints + role privileges).

-- ── Revision immutability — published history is append-only. The workflow inserts a revision and
--    moves the pointer, never mutates a prior revision. (The runtime role also has no UPDATE/DELETE on
--    the table; this trigger is the second layer.) A rare hard purge disables this trigger. ──────────
CREATE FUNCTION content.reject_revision_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'service_content_revisions are append-only (immutable): % rejected', TG_OP;
END;
$$;
CREATE TRIGGER trg_revisions_immutable
  BEFORE UPDATE OR DELETE ON content.service_content_revisions
  FOR EACH ROW EXECUTE FUNCTION content.reject_revision_mutation();

-- ── Block optimistic version — maintained by the DB, never assignable by a caller. The version bumps
--    by EXACTLY ONE when a mutable structure column actually changes (position/icon/core_config/
--    is_active); a no-op or non-structural UPDATE does not bump. Any value the caller places in
--    NEW.version is overwritten, so the runtime cannot assign an arbitrary version (it also lacks the
--    column privilege — see db/pg/bootstrap). This is the token approve_revision checks. ─────────────
CREATE FUNCTION content.bump_block_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.position, NEW.icon, NEW.core_config, NEW.is_active)
     IS DISTINCT FROM (OLD.position, OLD.icon, OLD.core_config, OLD.is_active) THEN
    NEW.version := OLD.version + 1;   -- exactly one bump per real structural change
    NEW.updated_at := now();
  ELSE
    NEW.version := OLD.version;       -- no-op / non-structural change: never bump, ignore manual sets
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_block_version
  BEFORE UPDATE ON content.service_content_blocks
  FOR EACH ROW EXECUTE FUNCTION content.bump_block_version();
