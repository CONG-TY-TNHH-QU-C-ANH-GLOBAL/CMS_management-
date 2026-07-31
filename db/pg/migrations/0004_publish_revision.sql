-- content.publish_revision — the ONLY runtime path that moves a published pointer. SECURITY DEFINER so
-- the runtime holds EXECUTE only (no direct publication-table write — see db/pg/bootstrap).
--
-- Lost-update safety (compare-and-swap, no advisory locks):
--   1. lock the STABLE localization row FOR UPDATE. The localization always exists before any
--      publication, so this serializes BOTH the first publication and every subsequent change — a lock
--      on the publication row cannot, because no publication row exists on first publish.
--   2. read the current pointer;
--   3. p_expected_revision_id is the EXACT expected pointer — NULL means "expect no current publication";
--   4. reject (serialization_failure) if the current pointer IS DISTINCT FROM the expectation;
--   5. atomically insert-or-move the single pointer.
-- Eligibility (revision exists, same localization, reviewed) is re-checked in the DB. Fully-qualified,
-- no dynamic SQL, no content/secret logging.
--
-- SQLSTATE 'PT001' = not eligible (→ not_publishable); serialization_failure = lost-update conflict.

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
  -- Function-local constants (used more than once below) — the not-eligible SQLSTATE and the one
  -- publishable status. content.repo maps 'PT001' → not_publishable by CODE.
  c_not_eligible CONSTANT text                  := 'PT001';
  v_reviewed     CONSTANT content.review_status := 'reviewed';
  v_owner   bigint;
  v_status  content.review_status;
  v_current bigint;
BEGIN
  -- 1. Serialize concurrent publishes for this localization on its stable row.
  PERFORM 1 FROM content.service_content_localizations WHERE id = p_localization_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'publish rejected: localization % does not exist', p_localization_id
      USING ERRCODE = c_not_eligible;
  END IF;

  -- Eligibility: the revision must exist, belong to this localization, and be reviewed.
  SELECT localization_id, review_status INTO v_owner, v_status
    FROM content.service_content_revisions WHERE id = p_revision_id;
  IF v_owner IS NULL OR v_owner <> p_localization_id THEN
    RAISE EXCEPTION 'publish rejected: revision % is not owned by localization %',
      p_revision_id, p_localization_id USING ERRCODE = c_not_eligible;
  END IF;
  IF v_status <> v_reviewed THEN
    RAISE EXCEPTION 'publish rejected: revision % is "%", only reviewed revisions may be published',
      p_revision_id, v_status USING ERRCODE = c_not_eligible;
  END IF;

  -- 2–4. Compare-and-swap against the EXACT expected pointer (NULL = expect none yet).
  SELECT revision_id INTO v_current
    FROM content.service_content_publications WHERE localization_id = p_localization_id;
  IF v_current IS DISTINCT FROM p_expected_revision_id THEN
    RAISE EXCEPTION 'publish rejected: pointer moved (expected %, found %)',
      p_expected_revision_id, v_current USING ERRCODE = 'serialization_failure';
  END IF;

  -- 5. Atomically insert or move the single pointer.
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
