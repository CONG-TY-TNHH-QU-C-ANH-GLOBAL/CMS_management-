-- Migrate users table for Google OAuth: make password_hash nullable,
-- add provider tracking. SQLite doesn't support DROP NOT NULL via ALTER,
-- so rebuild via temp table.

CREATE TABLE users_new (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  provider TEXT NOT NULL DEFAULT 'local' CHECK (provider IN ('local', 'google')),
  provider_user_id TEXT,
  picture_url TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_login_at INTEGER
);

INSERT INTO users_new (id, email, password_hash, name, role, status, created_at, last_login_at)
  SELECT id, email, password_hash, name, role, status, created_at, last_login_at FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

CREATE UNIQUE INDEX idx_users_provider_id ON users(provider, provider_user_id)
  WHERE provider_user_id IS NOT NULL;
