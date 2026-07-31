-- content.create_draft_revision — the ONLY runtime path to a revision. review_status is FORCED to
-- 'draft' (the caller cannot choose a status), so the runtime can never fabricate a 'reviewed' row.
-- SECURITY DEFINER: the runtime holds EXECUTE only (no direct INSERT on the revision table — see
-- db/pg/bootstrap). Drafts are pure appends (each is a new immutable row), so no optimistic-concurrency
-- token is needed here. Fully-qualified names, no dynamic SQL, no content/secret logging.
--
-- Application SQLSTATE 'PT001' = "content not eligible for this operation" — the repository maps it to a
-- bounded `not_publishable` error by CODE, not by message text (see content.repo mapDbError).

CREATE FUNCTION content.create_draft_revision(
  p_localization_id    bigint,
  p_title              text,
  p_description        text,
  p_translated_payload jsonb DEFAULT '{}'::jsonb,
  p_source_locale      text  DEFAULT NULL,
  p_source_hash        text  DEFAULT '',
  p_created_by         bigint DEFAULT NULL
) RETURNS bigint
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = content, pg_temp
AS $$
DECLARE
  v_new_id bigint;
BEGIN
  PERFORM 1 FROM content.service_content_localizations WHERE id = p_localization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'draft rejected: localization % does not exist', p_localization_id
      USING ERRCODE = 'PT001';
  END IF;

  INSERT INTO content.service_content_revisions
      (localization_id, title, description, translated_payload, source_locale, source_hash,
       review_status, reviewed_from_revision_id, created_by)
    VALUES
      (p_localization_id, p_title, p_description, COALESCE(p_translated_payload, '{}'::jsonb),
       p_source_locale, COALESCE(p_source_hash, ''), 'draft', NULL, p_created_by)
    RETURNING id INTO v_new_id;
  RETURN v_new_id;
END;
$$;
REVOKE ALL ON FUNCTION content.create_draft_revision(bigint, text, text, jsonb, text, text, bigint) FROM PUBLIC;
