-- Sprint S10 — Content Copilot
-- Stores chat sessions + messages between operators and the OpenAI Copilot,
-- plus a queue of pending content changes the AI proposes (approved by
-- operator before execution). Per-user daily token budget enforced server-side.

CREATE TABLE ai_chat_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New chat',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_ai_sessions_user ON ai_chat_sessions(user_id, updated_at DESC);

CREATE TABLE ai_chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content TEXT,
  tool_calls_json TEXT,
  tool_call_id TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_ai_messages_session ON ai_chat_messages(session_id, created_at);

CREATE TABLE ai_change_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  message_id INTEGER NOT NULL REFERENCES ai_chat_messages(id) ON DELETE CASCADE,
  tool_call_id TEXT NOT NULL,
  mutation_name TEXT NOT NULL,
  args_json TEXT NOT NULL,
  preview_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed')),
  decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_at INTEGER,
  error_message TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_ai_changes_session ON ai_change_requests(session_id, created_at DESC);
CREATE INDEX idx_ai_changes_status ON ai_change_requests(status, created_at DESC);

CREATE TABLE ai_usage (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
