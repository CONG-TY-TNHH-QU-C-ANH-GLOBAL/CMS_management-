-- 0035: Community Hub MVP (Sprint 1) — seller Q&A foundation.
--
-- Curated Q&A / Knowledge Hub, NOT a generic social network:
--   * community_questions: seller-submitted, default status='pending'
--     (never public until an operator publishes it in the CMS).
--   * Expert answer lives as columns on the question row — one curated THG
--     answer per question. A separate answers table is deferred until
--     community-authored answers are in scope.
--   * indexable is a COMPUTED property (src/features/community/community.policy.ts):
--     status='published' AND verified=1 AND expert_answer present.
--   * community_reactions dedupes "Same issue" by hashed IP (raw IP is only
--     kept on the question row itself, admin-only, mirroring leads).
--
-- VI-canonical, not localized in MVP: UGC is served in the language it was
-- written in. Hooking into *_translations + the AI pipeline is a follow-up.
--
-- FK references are documentation — D1 does not persist PRAGMA foreign_keys;
-- enforcement is application-side (repo convention, see 0032 header).

CREATE TABLE IF NOT EXISTS community_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT OR IGNORE INTO community_categories (slug, name, position) VALUES
  ('van-chuyen', 'Vận chuyển & Tracking', 1),
  ('pod', 'Print on Demand', 2),
  ('dropship', 'Dropshipping', 3),
  ('chi-phi-thanh-toan', 'Chi phí & Thanh toán', 4);

CREATE TABLE IF NOT EXISTS community_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category_id INTEGER REFERENCES community_categories(id),
  author_name TEXT NOT NULL,
  author_email TEXT NOT NULL,
  locale TEXT CHECK (locale IN ('en', 'vi', 'zh')),
  ip TEXT,
  user_agent TEXT,
  utm_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'rejected')),
  expert_answer TEXT,
  expert_answer_updated_at INTEGER,
  verified INTEGER NOT NULL DEFAULT 0,
  same_issue_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  published_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_community_questions_status_published
  ON community_questions(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_questions_category
  ON community_questions(category_id);

CREATE TABLE IF NOT EXISTS community_reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES community_questions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('same_issue', 'helpful')),
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_community_reactions_dedupe
  ON community_reactions(question_id, kind, ip_hash);
