// Telegram integration config — singleton row (id=1). Stores bot token,
// allowed chat IDs, and per-event notification flags. Actual send pipeline
// (worker that reads this config and calls Telegram API) wired in next sprint.

import { getDb } from "@/core/db/client";
import { auditLog, bumpCmsRev } from "@/core/db/mutations";

export interface TelegramConfigRow {
  id: number;
  bot_token: string | null;
  allowed_chat_ids_json: string | null;
  notify_new_lead: number;
  notify_new_applicant: number;
  notify_draft_review: number;
  notify_error: number;
  updated_at: number;
  updated_by: number | null;
}

export interface TelegramConfig {
  bot_token: string | null;
  allowed_chat_ids: string[];
  notify_new_lead: boolean;
  notify_new_applicant: boolean;
  notify_draft_review: boolean;
  notify_error: boolean;
  updated_at: number;
  configured: boolean;
}

function safeParseArray(json: string | null): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function rowToConfig(row: TelegramConfigRow): TelegramConfig {
  return {
    bot_token: row.bot_token,
    allowed_chat_ids: safeParseArray(row.allowed_chat_ids_json),
    notify_new_lead: row.notify_new_lead === 1,
    notify_new_applicant: row.notify_new_applicant === 1,
    notify_draft_review: row.notify_draft_review === 1,
    notify_error: row.notify_error === 1,
    updated_at: row.updated_at,
    configured: !!row.bot_token,
  };
}

export async function getTelegramConfig(): Promise<TelegramConfig> {
  const row = await getDb()
    .prepare(`SELECT * FROM telegram_config WHERE id = 1`)
    .first<TelegramConfigRow>();
  if (!row) {
    return {
      bot_token: null,
      allowed_chat_ids: [],
      notify_new_lead: false,
      notify_new_applicant: false,
      notify_draft_review: false,
      notify_error: false,
      updated_at: 0,
      configured: false,
    };
  }
  return rowToConfig(row);
}

export interface UpdateTelegramConfigInput {
  bot_token?: string | null;
  allowed_chat_ids?: string[];
  notify_new_lead?: boolean;
  notify_new_applicant?: boolean;
  notify_draft_review?: boolean;
  notify_error?: boolean;
}

export async function updateTelegramConfig(
  actorId: number,
  input: UpdateTelegramConfigInput,
): Promise<TelegramConfig> {
  const before = await getTelegramConfig();

  const fields: string[] = [];
  const values: unknown[] = [];
  if (input.bot_token !== undefined) { fields.push("bot_token = ?"); values.push(input.bot_token); }
  if (input.allowed_chat_ids !== undefined) {
    fields.push("allowed_chat_ids_json = ?");
    values.push(input.allowed_chat_ids.length > 0 ? JSON.stringify(input.allowed_chat_ids) : null);
  }
  if (input.notify_new_lead !== undefined) { fields.push("notify_new_lead = ?"); values.push(input.notify_new_lead ? 1 : 0); }
  if (input.notify_new_applicant !== undefined) { fields.push("notify_new_applicant = ?"); values.push(input.notify_new_applicant ? 1 : 0); }
  if (input.notify_draft_review !== undefined) { fields.push("notify_draft_review = ?"); values.push(input.notify_draft_review ? 1 : 0); }
  if (input.notify_error !== undefined) { fields.push("notify_error = ?"); values.push(input.notify_error ? 1 : 0); }

  if (fields.length === 0) return before;

  fields.push("updated_at = unixepoch()", "updated_by = ?");
  values.push(actorId);

  await getDb()
    .prepare(`UPDATE telegram_config SET ${fields.join(", ")} WHERE id = 1`)
    .bind(...values)
    .run();

  const after = await getTelegramConfig();
  // Don't log bot_token in audit (sensitive). Mask before logging.
  const redact = (c: TelegramConfig) => ({ ...c, bot_token: c.bot_token ? "***" : null });
  await auditLog(actorId, "update", "telegram_config", "1", redact(before), redact(after));
  await bumpCmsRev();
  return after;
}
