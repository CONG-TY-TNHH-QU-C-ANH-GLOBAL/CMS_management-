import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type { CrmLeadDeliveryHealth, CrmLeadDeliveryRow } from "./crm-lead-sync";

export const getCrmLeadDeliveryHealthFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { getCrmLeadDeliveryHealth } = await import("@/features/crm-lead-sync");
  await requireSession("admin");
  return await getCrmLeadDeliveryHealth();
});

const idSchema = z.object({ id: z.number().int().positive() });

export const retryCrmLeadDeliveryFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { flushCrmLeadOutbox, retryCrmLeadDelivery } = await import("@/features/crm-lead-sync");
    await requireSession("admin");
    const reopened = await retryCrmLeadDelivery(data.id);
    if (reopened) {
      try {
        await flushCrmLeadOutbox(5_000);
      } catch {
        // The durable outbox remains pending for the scheduled worker.
      }
    }
    return { ok: true, reopened };
  });

export const replayLeadTelegramDeliveryFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { replayLeadTelegramDelivery } = await import("@/features/crm-lead-sync");
    await requireSession("admin");
    const enqueued = await replayLeadTelegramDelivery(data.id);
    return { ok: true, enqueued };
  });

export const runCrmLeadDeliveryNowFn = createServerFn({ method: "POST" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { flushCrmLeadOutbox } = await import("@/features/crm-lead-sync");
  await requireSession("admin");
  await flushCrmLeadOutbox(5_000);
  return { ok: true };
});
