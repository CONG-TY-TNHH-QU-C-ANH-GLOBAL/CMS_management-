// Copilot service — sessions, messages, change-requests, daily token budget.
// All functions assume caller has already passed requireSession; no auth here.

import { getDb } from "@/core/db/client";

export type MessageRole = "system" | "user" | "assistant" | "tool";
export type ChangeRequestStatus = "pending" | "approved" | "rejected" | "executed" | "failed";

export interface ChatSessionRow {
  id: number;
  user_id: number;
  title: string;
  created_at: number;
  updated_at: number;
}

export interface ChatMessageRow {
  id: number;
  session_id: number;
  role: MessageRole;
  content: string | null;
  tool_calls_json: string | null;
  tool_call_id: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  created_at: number;
}

export interface ChangeRequestRow {
  id: number;
  session_id: number;
  message_id: number;
  tool_call_id: string;
  mutation_name: string;
  args_json: string;
  preview_json: string | null;
  status: ChangeRequestStatus;
  decided_by: number | null;
  decided_at: number | null;
  error_message: string | null;
  created_at: number;
}

// ───────────────────── Sessions ─────────────────────

export async function createSession(userId: number, title?: string): Promise<ChatSessionRow> {
  const result = await getDb()
    .prepare(`INSERT INTO ai_chat_sessions (user_id, title) VALUES (?, ?)`)
    .bind(userId, title?.trim() || "Cuộc trò chuyện mới")
    .run();
  const id = result.meta.last_row_id as number;
  return (await getSession(userId, id))!;
}

export async function getSession(userId: number, sessionId: number): Promise<ChatSessionRow | null> {
  return await getDb()
    .prepare(`SELECT * FROM ai_chat_sessions WHERE id = ? AND user_id = ? LIMIT 1`)
    .bind(sessionId, userId)
    .first<ChatSessionRow>();
}

export async function listSessions(userId: number, limit = 30): Promise<ChatSessionRow[]> {
  const res = await getDb()
    .prepare(
      `SELECT * FROM ai_chat_sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?`,
    )
    .bind(userId, limit)
    .all<ChatSessionRow>();
  return res.results ?? [];
}

export async function touchSession(sessionId: number): Promise<void> {
  await getDb()
    .prepare(`UPDATE ai_chat_sessions SET updated_at = unixepoch() WHERE id = ?`)
    .bind(sessionId)
    .run();
}

export async function renameSession(userId: number, sessionId: number, title: string): Promise<void> {
  const trimmed = title.trim().slice(0, 120);
  if (!trimmed) return;
  await getDb()
    .prepare(`UPDATE ai_chat_sessions SET title = ?, updated_at = unixepoch() WHERE id = ? AND user_id = ?`)
    .bind(trimmed, sessionId, userId)
    .run();
}

export async function deleteSession(userId: number, sessionId: number): Promise<void> {
  await getDb()
    .prepare(`DELETE FROM ai_chat_sessions WHERE id = ? AND user_id = ?`)
    .bind(sessionId, userId)
    .run();
}

// ───────────────────── Messages ─────────────────────

export interface AppendMessageInput {
  session_id: number;
  role: MessageRole;
  content?: string | null;
  tool_calls_json?: string | null;
  tool_call_id?: string | null;
  tokens_in?: number | null;
  tokens_out?: number | null;
}

export async function appendMessage(input: AppendMessageInput): Promise<ChatMessageRow> {
  const result = await getDb()
    .prepare(
      `INSERT INTO ai_chat_messages
         (session_id, role, content, tool_calls_json, tool_call_id, tokens_in, tokens_out)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.session_id,
      input.role,
      input.content ?? null,
      input.tool_calls_json ?? null,
      input.tool_call_id ?? null,
      input.tokens_in ?? null,
      input.tokens_out ?? null,
    )
    .run();
  const id = result.meta.last_row_id as number;
  return (await getDb()
    .prepare(`SELECT * FROM ai_chat_messages WHERE id = ?`)
    .bind(id)
    .first<ChatMessageRow>())!;
}

export async function listMessages(sessionId: number, limit = 200): Promise<ChatMessageRow[]> {
  const res = await getDb()
    .prepare(
      `SELECT * FROM ai_chat_messages WHERE session_id = ? ORDER BY created_at ASC, id ASC LIMIT ?`,
    )
    .bind(sessionId, limit)
    .all<ChatMessageRow>();
  return res.results ?? [];
}

// ───────────────────── Change requests ─────────────────────

export interface CreateChangeRequestInput {
  session_id: number;
  message_id: number;
  tool_call_id: string;
  mutation_name: string;
  args_json: string;
  preview_json?: string | null;
}

export async function createChangeRequest(input: CreateChangeRequestInput): Promise<ChangeRequestRow> {
  const result = await getDb()
    .prepare(
      `INSERT INTO ai_change_requests
         (session_id, message_id, tool_call_id, mutation_name, args_json, preview_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.session_id,
      input.message_id,
      input.tool_call_id,
      input.mutation_name,
      input.args_json,
      input.preview_json ?? null,
    )
    .run();
  const id = result.meta.last_row_id as number;
  return (await getChangeRequest(id))!;
}

export async function getChangeRequest(id: number): Promise<ChangeRequestRow | null> {
  return await getDb()
    .prepare(`SELECT * FROM ai_change_requests WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<ChangeRequestRow>();
}

export async function listChangeRequestsForSession(sessionId: number): Promise<ChangeRequestRow[]> {
  const res = await getDb()
    .prepare(
      `SELECT * FROM ai_change_requests WHERE session_id = ? ORDER BY created_at ASC, id ASC`,
    )
    .bind(sessionId)
    .all<ChangeRequestRow>();
  return res.results ?? [];
}

export async function listPendingChangeRequests(userId: number): Promise<ChangeRequestRow[]> {
  // All pending changes across this user's sessions (for the "Inbox" view).
  const res = await getDb()
    .prepare(
      `SELECT cr.* FROM ai_change_requests cr
         JOIN ai_chat_sessions s ON s.id = cr.session_id
         WHERE s.user_id = ? AND cr.status = 'pending'
         ORDER BY cr.created_at DESC LIMIT 50`,
    )
    .bind(userId)
    .all<ChangeRequestRow>();
  return res.results ?? [];
}

export async function markChangeRequestDecided(
  id: number,
  decision: Exclude<ChangeRequestStatus, "pending" | "executed" | "failed">,
  userId: number,
): Promise<void> {
  await getDb()
    .prepare(
      `UPDATE ai_change_requests
         SET status = ?, decided_by = ?, decided_at = unixepoch()
         WHERE id = ? AND status = 'pending'`,
    )
    .bind(decision, userId, id)
    .run();
}

export async function markChangeRequestExecuted(id: number): Promise<void> {
  await getDb()
    .prepare(
      `UPDATE ai_change_requests SET status = 'executed' WHERE id = ?`,
    )
    .bind(id)
    .run();
}

export async function markChangeRequestFailed(id: number, error: string): Promise<void> {
  await getDb()
    .prepare(
      `UPDATE ai_change_requests SET status = 'failed', error_message = ? WHERE id = ?`,
    )
    .bind(error.slice(0, 1000), id)
    .run();
}

// ───────────────────── Daily token budget ─────────────────────

const DEFAULT_DAILY_INPUT = 100_000;
const DEFAULT_DAILY_OUTPUT = 20_000;

export interface UsageRow {
  user_id: number;
  day: string;
  tokens_in: number;
  tokens_out: number;
}

function todayUtcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getTodayUsage(userId: number): Promise<UsageRow> {
  const day = todayUtcDay();
  const row = await getDb()
    .prepare(`SELECT * FROM ai_usage WHERE user_id = ? AND day = ?`)
    .bind(userId, day)
    .first<UsageRow>();
  return row ?? { user_id: userId, day, tokens_in: 0, tokens_out: 0 };
}

export interface BudgetCheckResult {
  allowed: boolean;
  used_in: number;
  used_out: number;
  limit_in: number;
  limit_out: number;
}

export async function checkBudget(userId: number): Promise<BudgetCheckResult> {
  const usage = await getTodayUsage(userId);
  return {
    allowed: usage.tokens_in < DEFAULT_DAILY_INPUT && usage.tokens_out < DEFAULT_DAILY_OUTPUT,
    used_in: usage.tokens_in,
    used_out: usage.tokens_out,
    limit_in: DEFAULT_DAILY_INPUT,
    limit_out: DEFAULT_DAILY_OUTPUT,
  };
}

export async function recordUsage(userId: number, tokensIn: number, tokensOut: number): Promise<void> {
  const day = todayUtcDay();
  await getDb()
    .prepare(
      `INSERT INTO ai_usage (user_id, day, tokens_in, tokens_out)
         VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, day) DO UPDATE SET
         tokens_in = tokens_in + excluded.tokens_in,
         tokens_out = tokens_out + excluded.tokens_out`,
    )
    .bind(userId, day, tokensIn, tokensOut)
    .run();
}
