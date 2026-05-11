-- 0013: telegram_config singleton for bot integration.
--
-- Stores bot token + allowed chat IDs + per-event notification flags.
-- Future: a Telegram worker reads this table and routes inbound messages
-- + outbound notifications. For now admin can save the config; the actual
-- send pipeline wires in a later sprint.

CREATE TABLE IF NOT EXISTS telegram_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  bot_token TEXT,
  allowed_chat_ids_json TEXT,                                       -- JSON array of strings
  notify_new_lead INTEGER NOT NULL DEFAULT 0,                       -- 0 | 1
  notify_new_applicant INTEGER NOT NULL DEFAULT 0,
  notify_draft_review INTEGER NOT NULL DEFAULT 0,
  notify_error INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

INSERT OR IGNORE INTO telegram_config (id) VALUES (1);
