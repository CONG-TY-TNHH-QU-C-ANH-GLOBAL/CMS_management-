-- 0063: Uploaded campaign landing pages (served on lp.thgfulfill.com).
--
-- Marketing uploads a .zip (index.html + assets/) per campaign. Every upload
-- is an IMMUTABLE version: its files live in R2 under
--   landings/<slug>/<version id>/site/<path>     (served tree, normalized index.html)
--   landings/<slug>/<version id>/source/index.html  (the index.html as uploaded)
-- and this table holds the version's metadata, the format report (what the
-- deterministic + AI format steps changed) and the audit findings.
--
-- Publishing does not copy anything: it points campaigns.landing_version_id at
-- a version, so a rollback is pointing it back. The lp host resolves
-- /<slug>/... through that pointer on every request.
--
-- The version id is 32 random hex characters. It is also the unguessable
-- token in the preview URL (/_preview/<id>/), so it must never be derived
-- from anything predictable.
--
-- D1 does not enforce ON DELETE CASCADE (repo convention, see 0035), so
-- deleteCampaign removes a campaign's versions explicitly.

CREATE TABLE campaign_landing_versions (
  id TEXT PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  -- Campaign slug at upload time. Slugs are immutable (not editor-writable),
  -- and the R2 prefix is built from it.
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'failed')),
  original_name TEXT,
  file_count INTEGER NOT NULL DEFAULT 0,
  total_bytes INTEGER NOT NULL DEFAULT 0,
  -- ["index.html", "assets/hero.jpg", ...] — the bundle manifest the checks read.
  files_json TEXT NOT NULL DEFAULT '[]',
  -- { format: { mode, note, applied, diff }, audit: { mode, note }, warnings: [] }
  report_json TEXT NOT NULL DEFAULT '{}',
  -- [{ severity, category, message, evidence, source }]
  findings_json TEXT NOT NULL DEFAULT '[]',
  critical_count INTEGER NOT NULL DEFAULT 0,
  major_count INTEGER NOT NULL DEFAULT 0,
  minor_count INTEGER NOT NULL DEFAULT 0,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  processed_at INTEGER,
  -- Last time this version became the live one. Rollback picks the most
  -- recent previously published version from this column.
  last_published_at INTEGER,
  last_published_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_campaign_landing_versions_campaign
  ON campaign_landing_versions(campaign_id, created_at);

-- The published version (NULL = no uploaded landing is live). Not part of
-- CAMPAIGN_WRITABLE: only the landing publish / rollback path sets it.
ALTER TABLE campaigns ADD COLUMN landing_version_id TEXT;

-- New Telegram event (landing_review, kind infra). Subscribe the existing
-- engineering channels so IT receives upload reports without a manual matrix
-- toggle; the primary key (channel_id, event_type) makes a re-run harmless.
INSERT OR IGNORE INTO telegram_subscriptions (channel_id, event_type)
SELECT id, 'landing_review' FROM telegram_channels WHERE kind = 'infra';
