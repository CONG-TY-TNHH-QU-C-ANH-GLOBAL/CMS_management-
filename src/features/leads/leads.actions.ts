import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type { LeadLocale, LeadRow, LeadStatus } from "@/features/leads";

const STATUSES = z.enum(["new", "contacted", "qualified", "proposal", "won", "lost"]);

export const listLeadsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { listLeads } = await import("@/features/leads");
  await requireSession("editor");
  return { leads: await listLeads({ limit: 200 }) };
});

const updateStatusSchema = z
  .object({
    id: z.number().int().positive(),
    status: STATUSES,
    lost_reason: z.string().trim().max(500).optional().nullable(),
  })
  .refine((value) => value.status !== "lost" || Boolean(value.lost_reason), {
    message: "Cần nhập lý do khi đánh dấu lead là Lost",
    path: ["lost_reason"],
  });

export const updateLeadStatusFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => updateStatusSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { setLeadStatus } = await import("@/features/leads");
    await requireSession("editor");
    await setLeadStatus(data.id, data.status, data.lost_reason);
    return { ok: true as const };
  });
