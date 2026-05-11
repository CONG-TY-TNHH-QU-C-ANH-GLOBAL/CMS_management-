import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type { TelegramConfig } from "@/features/telegram";

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
