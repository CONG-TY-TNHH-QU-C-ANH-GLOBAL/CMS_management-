-- Local email + password login, running alongside Google OAuth.
-- `password_hash` already exists (nullable, added in 0002_oauth.sql); these
-- columns carry rotation tracking and brute-force lockout state.
--
-- `provider` is deliberately left alone: it records how the account was first
-- created, while password login is gated purely on `password_hash` being set.
-- A Google account can therefore also hold a password without changing rows.

ALTER TABLE users ADD COLUMN password_updated_at INTEGER;
ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until INTEGER;
