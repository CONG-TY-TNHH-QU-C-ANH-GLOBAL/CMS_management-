import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type { LeadLocale, LeadRow, LeadStatus } from "@/features/leads";

const STATUSES = z.enum(["new", "contacted", "qualified", "closed", "spam"]);

export const listLeadsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { listLeads } = await import("@/features/leads");
  await requireSession("editor");
  return { leads: await listLeads({ limit: 200 }) };
});

const updateStatusSchema = z.object({
  id: z.number().int().positive(),
  status: STATUSES,
});

export const updateLeadStatusFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => updateStatusSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { setLeadStatus } = await import("@/features/leads");
    await requireSession("editor");
    await setLeadStatus(data.id, data.status);
    return { ok: true as const };
  });
