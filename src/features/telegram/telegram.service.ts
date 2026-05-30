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

// ─────────────────────────────────────────────────────────────────────────────
// Workstream B — channels / subscriptions / outbox CRUD.
// ─────────────────────────────────────────────────────────────────────────────

import type { ChannelKind, EventType } from "./telegram.events";

export interface TelegramChannel {
  id: number;
  label: string;
  chat_id: string;
  kind: ChannelKind;
  paused: boolean;
  created_at: number;
  updated_at: number;
}

interface TelegramChannelRow {
  id: number;
  label: string;
  chat_id: string;
  kind: ChannelKind;
  paused: number;
  created_at: number;
  updated_at: number;
}

function channelFromRow(r: TelegramChannelRow): TelegramChannel {
  return { ...r, paused: r.paused === 1 };
}

export async function listTelegramChannels(): Promise<TelegramChannel[]> {
  const res = await getDb()
    .prepare(`SELECT * FROM telegram_channels ORDER BY kind ASC, id ASC`)
    .all<TelegramChannelRow>();
  return (res.results ?? []).map(channelFromRow);
}

export async function getTelegramChannel(id: number): Promise<TelegramChannel | null> {
  const row = await getDb()
    .prepare(`SELECT * FROM telegram_channels WHERE id = ?`)
    .bind(id)
    .first<TelegramChannelRow>();
  return row ? channelFromRow(row) : null;
}

export interface UpsertTelegramChannelInput {
  id?: number;
  label: string;
  chat_id: string;
  kind: ChannelKind;
}

export async function upsertTelegramChannel(
  actorId: number,
  input: UpsertTelegramChannelInput,
): Promise<TelegramChannel> {
  if (input.id) {
    const before = await getTelegramChannel(input.id);
    if (!before) throw new Error("Channel not found");
    await getDb()
      .prepare(
        `UPDATE telegram_channels SET label = ?, chat_id = ?, kind = ?, updated_at = unixepoch() WHERE id = ?`,
      )
      .bind(input.label, input.chat_id, input.kind, input.id)
      .run();
    const after = await getTelegramChannel(input.id);
    await auditLog(actorId, "update", "telegram_channel", String(input.id), before, after);
    return after!;
  }
  const res = await getDb()
    .prepare(`INSERT INTO telegram_channels (label, chat_id, kind) VALUES (?, ?, ?)`)
    .bind(input.label, input.chat_id, input.kind)
    .run();
  const newId = Number((res.meta as { last_row_id?: number } | undefined)?.last_row_id ?? 0);
  const after = await getTelegramChannel(newId);
  await auditLog(actorId, "create", "telegram_channel", String(newId), null, after);
  return after!;
}

export async function deleteTelegramChannel(actorId: number, id: number): Promise<void> {
  const before = await getTelegramChannel(id);
  if (!before) return;
  // D1 ships with PRAGMA foreign_keys=OFF, so the ON DELETE CASCADE declared
  // in the schema does NOT fire automatically — clean up dependents manually.
  await getDb().prepare(`DELETE FROM telegram_subscriptions WHERE channel_id = ?`).bind(id).run();
  await getDb().prepare(`DELETE FROM telegram_outbox WHERE channel_id = ?`).bind(id).run();
  await getDb().prepare(`DELETE FROM telegram_channels WHERE id = ?`).bind(id).run();
  await auditLog(actorId, "delete", "telegram_channel", String(id), before, null);
}

export async function setChannelPaused(actorId: number, id: number, paused: boolean): Promise<TelegramChannel> {
  const before = await getTelegramChannel(id);
  if (!before) throw new Error("Channel not found");
  await getDb()
    .prepare(`UPDATE telegram_channels SET paused = ?, updated_at = unixepoch() WHERE id = ?`)
    .bind(paused ? 1 : 0, id)
    .run();
  const after = await getTelegramChannel(id);
  await auditLog(actorId, "update", "telegram_channel", String(id), before, after);
  return after!;
}

// Subscriptions — operator picks (channel × event_type) pairs.

export interface TelegramSubscription {
  channel_id: number;
  event_type: EventType;
  enabled: boolean;
}

interface TelegramSubscriptionRow {
  channel_id: number;
  event_type: string;
  enabled: number;
}

export async function listTelegramSubscriptions(): Promise<TelegramSubscription[]> {
  const res = await getDb()
    .prepare(`SELECT channel_id, event_type, enabled FROM telegram_subscriptions`)
    .all<TelegramSubscriptionRow>();
  return (res.results ?? []).map((r) => ({
    channel_id: r.channel_id,
    event_type: r.event_type as EventType,
    enabled: r.enabled === 1,
  }));
}

export async function setSubscription(
  actorId: number,
  channelId: number,
  eventType: EventType,
  enabled: boolean,
): Promise<void> {
  // Verify channel exists for FK safety + auditable context.
  const channel = await getTelegramChannel(channelId);
  if (!channel) throw new Error("Channel not found");
  await getDb()
    .prepare(
      `INSERT INTO telegram_subscriptions (channel_id, event_type, enabled)
       VALUES (?, ?, ?)
       ON CONFLICT(channel_id, event_type) DO UPDATE SET enabled = excluded.enabled`,
    )
    .bind(channelId, eventType, enabled ? 1 : 0)
    .run();
  await auditLog(
    actorId,
    "update",
    "telegram_subscription",
    `${channelId}:${eventType}`,
    null,
    { channel_id: channelId, event_type: eventType, enabled },
  );
}

// Outbox — operator-visible "failed sends" + retry handle.

export interface OutboxRow {
  id: number;
  event_type: string;
  channel_id: number;
  chat_id: string;
  body_text: string;
  attempts: number;
  next_attempt_at: number;
  last_error: string | null;
  sent_at: number | null;
  failed_permanently_at: number | null;
  created_at: number;
}

export async function listFailedOutbox(limit = 20): Promise<OutboxRow[]> {
  const res = await getDb()
    .prepare(
      `SELECT * FROM telegram_outbox
       WHERE failed_permanently_at IS NOT NULL
       ORDER BY failed_permanently_at DESC LIMIT ?`,
    )
    .bind(limit)
    .all<OutboxRow>();
  return res.results ?? [];
}

export async function retryOutboxRow(actorId: number, id: number): Promise<void> {
  await getDb()
    .prepare(
      `UPDATE telegram_outbox
       SET failed_permanently_at = NULL,
           attempts = 0,
           next_attempt_at = unixepoch(),
           last_error = NULL
       WHERE id = ?`,
    )
    .bind(id)
    .run();
  await auditLog(actorId, "update", "telegram_outbox", String(id), null, { action: "retry" });
}

// Legacy import — one-shot, idempotent. Promotes each allowed_chat_id from the
// old telegram_config singleton to a kind='ops' channel and mirrors enabled
// notify_* flags as subscriptions.

const LEGACY_FLAG_MAP: Record<
  "notify_new_lead" | "notify_new_applicant" | "notify_draft_review" | "notify_error",
  EventType
> = {
  notify_new_lead: "lead_received",
  notify_new_applicant: "applicant_received",
  notify_draft_review: "draft_pending_review",
  notify_error: "translation_failed",
};

export interface ImportLegacyResult {
  channelsCreated: number;
  subscriptionsCreated: number;
  alreadyImported: boolean;
}

export async function importLegacyTelegramConfig(actorId: number): Promise<ImportLegacyResult> {
  const cfg = await getTelegramConfig();
  if (cfg.allowed_chat_ids.length === 0) {
    return { channelsCreated: 0, subscriptionsCreated: 0, alreadyImported: true };
  }
  const enabledFlags: EventType[] = [];
  if (cfg.notify_new_lead) enabledFlags.push(LEGACY_FLAG_MAP.notify_new_lead);
  if (cfg.notify_new_applicant) enabledFlags.push(LEGACY_FLAG_MAP.notify_new_applicant);
  if (cfg.notify_draft_review) enabledFlags.push(LEGACY_FLAG_MAP.notify_draft_review);
  if (cfg.notify_error) enabledFlags.push(LEGACY_FLAG_MAP.notify_error);

  let channelsCreated = 0;
  let subscriptionsCreated = 0;

  for (let i = 0; i < cfg.allowed_chat_ids.length; i++) {
    const chatId = cfg.allowed_chat_ids[i];
    const existing = await getDb()
      .prepare(`SELECT id FROM telegram_channels WHERE chat_id = ?`)
      .bind(chatId)
      .first<{ id: number }>();
    let channelId: number;
    if (existing) {
      channelId = existing.id;
    } else {
      const res = await getDb()
        .prepare(`INSERT INTO telegram_channels (label, chat_id, kind) VALUES (?, ?, 'ops')`)
        .bind(`Legacy #${i + 1}`, chatId)
        .run();
      channelId = Number((res.meta as { last_row_id?: number } | undefined)?.last_row_id ?? 0);
      channelsCreated += 1;
      await auditLog(actorId, "create", "telegram_channel", String(channelId), null, {
        label: `Legacy #${i + 1}`,
        chat_id: chatId,
        kind: "ops",
        source: "legacy_import",
      });
    }
    for (const ev of enabledFlags) {
      const res = await getDb()
        .prepare(
          `INSERT INTO telegram_subscriptions (channel_id, event_type, enabled)
           VALUES (?, ?, 1)
           ON CONFLICT(channel_id, event_type) DO NOTHING`,
        )
        .bind(channelId, ev)
        .run();
      const changes = (res.meta as { changes?: number; rows_written?: number } | undefined)?.changes
        ?? (res.meta as { rows_written?: number } | undefined)?.rows_written
        ?? 0;
      if (changes >= 1) subscriptionsCreated += 1;
    }
  }
  return { channelsCreated, subscriptionsCreated, alreadyImported: false };
}

export interface LegacyConfigSummary {
  hasLegacyChatIds: boolean;
  legacyChatIdCount: number;
  enabledFlagCount: number;
  anyChannelsExist: boolean;
}

export async function getLegacyConfigSummary(): Promise<LegacyConfigSummary> {
  const cfg = await getTelegramConfig();
  const enabledFlagCount =
    (cfg.notify_new_lead ? 1 : 0) +
    (cfg.notify_new_applicant ? 1 : 0) +
    (cfg.notify_draft_review ? 1 : 0) +
    (cfg.notify_error ? 1 : 0);
  const anyChannels = await getDb()
    .prepare(`SELECT 1 FROM telegram_channels LIMIT 1`)
    .first<{ "1": number }>();
  return {
    hasLegacyChatIds: cfg.allowed_chat_ids.length > 0,
    legacyChatIdCount: cfg.allowed_chat_ids.length,
    enabledFlagCount,
    anyChannelsExist: !!anyChannels,
  };
}
