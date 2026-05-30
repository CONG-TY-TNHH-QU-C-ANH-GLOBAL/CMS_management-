-- 0032: Telegram channels + subscriptions + outbox (Workstream B — event-bus)
--
-- Replaces the singleton-with-flat-array model from 0013 (telegram_config) with
-- a proper many-to-many: each destination chat is its own channel row, and the
-- 4 hardcoded notify_* booleans become subscription rows that an operator can
-- toggle per (channel, event_type). All sends go through a durable outbox so
-- transient Telegram failures (429/5xx/network) are retried by the cron worker
-- instead of being silently dropped.
--
-- bot_token still lives in telegram_config (singleton, sensitive); the boolean
-- columns there become unused but are NOT dropped yet — they're the rollback
-- target until B is proven in prod. A follow-up migration drops them later.
--
-- Backfill of existing data is intentionally NOT done in SQL (D1 cannot parse
-- JSON in DDL); the admin UI surfaces an "Import legacy config" button that
-- promotes each allowed_chat_id to a kind='ops' channel + creates subscription
-- rows mirroring the legacy boolean flags. Idempotent + reversible.

CREATE TABLE IF NOT EXISTS telegram_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('ops','infra','custom')),
  paused INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_channels_chat_id ON telegram_channels(chat_id);

CREATE TABLE IF NOT EXISTS telegram_subscriptions (
  channel_id INTEGER NOT NULL REFERENCES telegram_channels(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (channel_id, event_type)
);

CREATE TABLE IF NOT EXISTS telegram_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  channel_id INTEGER NOT NULL REFERENCES telegram_channels(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  body_text TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_error TEXT,
  sent_at INTEGER,
  failed_permanently_at INTEGER,
  idempotency_key TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
-- Pending-row scan: cron's flush worker picks these up in order.
CREATE INDEX IF NOT EXISTS idx_telegram_outbox_pending
  ON telegram_outbox(next_attempt_at)
  WHERE sent_at IS NULL AND failed_permanently_at IS NULL;
-- Dedup: same (event,entity,channel) collapses to one outbox row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_outbox_idempotency
  ON telegram_outbox(idempotency_key) WHERE idempotency_key IS NOT NULL;
