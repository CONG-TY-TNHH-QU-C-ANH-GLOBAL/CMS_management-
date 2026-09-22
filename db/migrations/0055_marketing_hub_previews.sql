-- Expiring review capabilities for pre-approval Marketing Hub blog versions.
-- Only the token hash is persisted; the raw capability is derived from a
-- dedicated Worker secret and never appears in D1 or audit records.
CREATE TABLE marketing_hub_previews (
  external_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  source_revision INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind='blog'),
  locale TEXT NOT NULL CHECK(locale IN ('vi','en','zh')),
  slug TEXT NOT NULL,
  projection_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX marketing_hub_previews_expiry ON marketing_hub_previews(expires_at);
