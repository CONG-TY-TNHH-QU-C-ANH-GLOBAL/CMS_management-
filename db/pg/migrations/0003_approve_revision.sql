-- content.approve_revision — closes the review-provenance gap. Creates an immutable 'reviewed' revision
-- that is an EXACT COPY of a specific 'draft', linked by reviewed_from_revision_id. The caller supplies
-- NO content (title/description/payload) — it is copied verbatim from the draft, so a reviewed revision
-- provably corresponds to a submitted draft. The draft is NOT mutated (revisions are immutable).
-- Eligibility: the source must be a 'draft' (stale/failed/reviewed rejected). uq_reviewed_from forbids
-- approving one draft twice. Optional optimistic concurrency: p_expected_version, when supplied, must
-- equal the owning block's current version (0005 maintains it). No row lock is taken — the immutable
-- source plus uq_reviewed_from give the concurrency guarantee, keeping the function-owner INSERT-only
-- on revisions. SECURITY DEFINER; fully-qualified; no dynamic SQL; no content/secret logging.
--
-- SQLSTATE 'PT001' = not eligible (→ not_publishable); 'PT409'/serialization_failure = concurrency.

CREATE FUNCTION content.approve_revision(
  p_draft_revision_id bigint,
  p_reviewer_id       bigint,
  p_expected_version  bigint DEFAULT NULL
) RETURNS bigint
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = content, pg_temp
AS $$
DECLARE
  d               content.service_content_revisions%ROWTYPE;
  v_new_id        bigint;
  v_block_version integer;
BEGIN
  SELECT * INTO d FROM content.service_content_revisions
   WHERE id = p_draft_revision_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'approve rejected: revision % does not exist', p_draft_revision_id
      USING ERRCODE = 'PT001';
  END IF;
  IF d.review_status <> 'draft' THEN
    RAISE EXCEPTION 'approve rejected: revision % is "%", only a draft is reviewable',
      p_draft_revision_id, d.review_status USING ERRCODE = 'PT001';
  END IF;

  IF p_expected_version IS NOT NULL THEN
    SELECT b.version INTO v_block_version
      FROM content.service_content_blocks b
      JOIN content.service_content_localizations l ON l.block_id = b.id
     WHERE l.id = d.localization_id;
    IF v_block_version IS DISTINCT FROM p_expected_version THEN
      RAISE EXCEPTION 'approve rejected: block version moved (expected %, found %)',
        p_expected_version, v_block_version USING ERRCODE = 'serialization_failure';
    END IF;
  END IF;

  -- Append a reviewed revision copying the draft's EXACT content + preserving source provenance.
  INSERT INTO content.service_content_revisions
      (localization_id, title, description, translated_payload, source_locale, source_hash,
       review_status, reviewed_from_revision_id, reviewed_by, reviewed_at, created_by)
    VALUES
      (d.localization_id, d.title, d.description, d.translated_payload, d.source_locale, d.source_hash,
       'reviewed', d.id, p_reviewer_id, now(), d.created_by)
    RETURNING id INTO v_new_id;
  RETURN v_new_id;
END;
$$;
REVOKE ALL ON FUNCTION content.approve_revision(bigint, bigint, bigint) FROM PUBLIC;
