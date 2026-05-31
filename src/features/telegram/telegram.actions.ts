import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type { TelegramConfig, TelegramChannel, TelegramSubscription, OutboxRow, LegacyConfigSummary } from "@/features/telegram";

export const getTelegramConfigFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { getTelegramConfig } = await import("@/features/telegram");
  await requireSession("admin");
  return await getTelegramConfig();
});

const updateSchema = z.object({
  bot_token: z.string().max(200).nullable().optional(),
  allowed_chat_ids: z.array(z.string().regex(/^-?\d+$/).max(40)).max(50).optional(),
  notify_new_lead: z.boolean().optional(),
  notify_new_applicant: z.boolean().optional(),
  notify_draft_review: z.boolean().optional(),
  notify_error: z.boolean().optional(),
});

export const updateTelegramConfigFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => updateSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { updateTelegramConfig } = await import("@/features/telegram");
    const me = await requireSession("admin");
    return await updateTelegramConfig(me.id, data);
  });

// ─────────────────────────────────────────────────────────────────────────────
// Workstream B — channels / subscriptions / outbox / legacy import / test send.
// ─────────────────────────────────────────────────────────────────────────────

// Telegram chat_id pattern: optional leading -, then digits. Up to 40 chars.
const chatIdSchema = z.string().regex(/^-?\d+$/).max(40);
const channelKindSchema = z.enum(["ops", "infra", "custom"]);

export const testBotTokenFn = createServerFn({ method: "POST" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { getTelegramConfig, telegramGetMe } = await import("@/features/telegram");
  await requireSession("admin");
  const cfg = await getTelegramConfig();
  if (!cfg.bot_token) return { ok: false as const, error: "Chưa cấu hình bot_token." };
  return await telegramGetMe(cfg.bot_token);
});

export const listTelegramChannelsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { listTelegramChannels } = await import("@/features/telegram");
  await requireSession("viewer");
  return { channels: await listTelegramChannels() };
});

const upsertChannelSchema = z.object({
  id: z.number().int().positive().optional(),
  label: z.string().min(1).max(80),
  chat_id: chatIdSchema,
  kind: channelKindSchema,
});

export const upsertTelegramChannelFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => upsertChannelSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { upsertTelegramChannel } = await import("@/features/telegram");
    const me = await requireSession("admin");
    return await upsertTelegramChannel(me.id, data);
  });

const idSchema = z.object({ id: z.number().int().positive() });

export const deleteTelegramChannelFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { deleteTelegramChannel } = await import("@/features/telegram");
    const me = await requireSession("admin");
    await deleteTelegramChannel(me.id, data.id);
    return { ok: true };
  });

const toggleChannelSchema = z.object({ id: z.number().int().positive(), paused: z.boolean() });

export const toggleChannelPauseFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => toggleChannelSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { setChannelPaused } = await import("@/features/telegram");
    const me = await requireSession("admin");
    return await setChannelPaused(me.id, data.id, data.paused);
  });

export const listTelegramSubscriptionsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { listTelegramSubscriptions } = await import("@/features/telegram");
  await requireSession("viewer");
  return { subscriptions: await listTelegramSubscriptions() };
});

// Allow EVENT_TYPES values + any string (forward-compat — admin matrix only
// shows known events, but DB column is TEXT to tolerate future additions).
const toggleSubscriptionSchema = z.object({
  channel_id: z.number().int().positive(),
  event_type: z.string().min(1).max(60),
  enabled: z.boolean(),
});

export const toggleSubscriptionFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => toggleSubscriptionSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { setSubscription, isKnownEventType } = await import("@/features/telegram");
    const me = await requireSession("admin");
    if (!isKnownEventType(data.event_type)) {
      throw new Error(`Unknown event_type: ${data.event_type}`);
    }
    await setSubscription(me.id, data.channel_id, data.event_type, data.enabled);
    return { ok: true };
  });

export const sendChannelTestFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const {
      getTelegramChannel,
      getTelegramConfig,
      sendTelegramMessage,
      formatChannelTest,
    } = await import("@/features/telegram");
    await requireSession("admin");
    const channel = await getTelegramChannel(data.id);
    if (!channel) return { ok: false as const, error: "Channel không tồn tại." };
    const cfg = await getTelegramConfig();
    if (!cfg.bot_token) return { ok: false as const, error: "Chưa cấu hình bot_token." };
    const body = formatChannelTest(channel.label);
    const result = await sendTelegramMessage(cfg.bot_token, channel.chat_id, body);
    if (result.kind === "ok") return { ok: true as const };
    return { ok: false as const, error: `${result.status ?? ""} ${result.message}`.trim() };
  });

export const importLegacyTelegramConfigFn = createServerFn({ method: "POST" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { importLegacyTelegramConfig } = await import("@/features/telegram");
  const me = await requireSession("admin");
  return await importLegacyTelegramConfig(me.id);
});

export const getLegacyConfigSummaryFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { getLegacyConfigSummary } = await import("@/features/telegram");
  await requireSession("viewer");
  return await getLegacyConfigSummary();
});

const listFailedSchema = z.object({ limit: z.number().int().positive().max(100).optional() });

export const listFailedOutboxFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => listFailedSchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { listFailedOutbox } = await import("@/features/telegram");
    await requireSession("admin");
    return { rows: await listFailedOutbox(data.limit ?? 20) };
  });

export const retryOutboxFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { retryOutboxRow, flushTelegramOutbox } = await import("@/features/telegram");
    const me = await requireSession("admin");
    await retryOutboxRow(me.id, data.id);
    // Inline-kick a short flush so the retry feedback is immediate.
    try {
      await flushTelegramOutbox(5_000);
    } catch {
      /* outbox is durable; cron picks up if this fails */
    }
    return { ok: true };
  });
