-- 0036: Community Q&A ownership + soft withdrawal.
--
-- Lets a submitter withdraw their own question from the same browser without
-- accounts or admin help: submit returns a one-time raw owner token; we persist
-- only its SHA-256 hash. Withdrawal re-hashes the presented token and, on match,
-- soft-deletes by stamping withdrawn_at (the row is retained for admin audit).
--
-- Withdrawn is modelled as `withdrawn_at IS NOT NULL` rather than a new status
-- value so we don't have to rebuild the status CHECK constraint. Public list /
-- detail / same-issue all add `AND withdrawn_at IS NULL`, so withdrawn rows
-- vanish from the public API (and therefore sitemap/prerender/indexing) while
-- staying visible to admin queries.

ALTER TABLE community_questions ADD COLUMN owner_token_hash TEXT;
ALTER TABLE community_questions ADD COLUMN withdrawn_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_community_questions_owner_token
  ON community_questions(owner_token_hash);
