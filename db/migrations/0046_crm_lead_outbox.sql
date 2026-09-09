-- Durable CMS -> CRM lead projection. The CMS `leads` table remains the
-- capture source of truth; this outbox guarantees CRM outages never lose a
-- website inquiry and supports an idempotent historical backfill.
CREATE TABLE IF NOT EXISTS crm_lead_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL UNIQUE,
  event_key TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER,
  failed_permanently_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_crm_lead_outbox_pending
  ON crm_lead_outbox(sent_at, failed_permanently_at, next_attempt_at, id);
