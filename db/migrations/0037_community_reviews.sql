-- 0037: Community Verified Reviews (Sprint 4) — seller trust layer.
--
-- Mirrors the Q&A moderation model (0035/0036): seller-submitted reviews land
-- as status='pending' and are never public until an operator publishes them.
-- A review only reaches SEO surfaces once it is BOTH published AND
-- "Verified by THG" (verified=1) — the indexing gate lives in
-- src/features/community/community.policy.ts (isReviewIndexable).
--
-- Reuses community_categories (same POD / dropship / shipping / cost taxonomy
-- as questions) — a review's category_id FK points at that shared table.
--
-- Privacy: reviewer_email, ip, user_agent, utm_json, owner_token_hash and the
-- private_evidence_note / private_order_reference moderation fields are
-- admin-only and never mapped to a public response (community.mappers.ts).
--
-- Ownership/withdrawal is identical to questions: submit returns a one-time raw
-- owner token, only its SHA-256 hash is persisted, and withdrawal soft-deletes
-- via withdrawn_at IS NOT NULL (row retained for admin audit). Public list /
-- detail add `AND withdrawn_at IS NULL`, so withdrawn reviews vanish from the
-- public API (and therefore sitemap/prerender/indexing).
--
-- FK references are documentation — D1 does not persist PRAGMA foreign_keys;
-- enforcement is application-side (repo convention, see 0035 header).

CREATE TABLE IF NOT EXISTS community_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category_id INTEGER REFERENCES community_categories(id),
  reviewer_name TEXT NOT NULL,
  reviewer_email TEXT NOT NULL,
  rating INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  locale TEXT CHECK (locale IN ('en', 'vi', 'zh')),
  ip TEXT,
  user_agent TEXT,
  utm_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'rejected')),
  verified INTEGER NOT NULL DEFAULT 0,
  -- Optional operator-written public gloss shown above the review body.
  public_summary TEXT,
  -- Admin-only moderation context (proof the reviewer submitted privately).
  private_evidence_note TEXT,
  private_order_reference TEXT,
  owner_token_hash TEXT,
  withdrawn_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  published_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_community_reviews_status_published
  ON community_reviews(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_reviews_category
  ON community_reviews(category_id);
CREATE INDEX IF NOT EXISTS idx_community_reviews_owner_token
  ON community_reviews(owner_token_hash);
