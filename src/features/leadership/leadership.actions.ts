import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type { LeadershipRow } from "./leadership.service";

const ID = z.number().int().positive();
const STATUS = z.enum(["draft", "live"]);
const inputSchema = z.object({
  position: z.number().int().min(0),
  name: z.string().trim().min(1).max(120),
  role: z.string().trim().max(160).nullable().optional(),
  quote: z.string().trim().max(1000).nullable().optional(),
  status: STATUS.optional(),
  avatar_media_ids: z.array(ID).min(1, "Leadership cần ít nhất 1 avatar.").max(8),
});

export const listLeadershipFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { listLeadership } = await import("@/features/leadership");
  await requireSession("viewer");
  return { leadership: await listLeadership() };
});

export const createLeadershipFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { createLeadership } = await import("@/features/leadership");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    const leadership = await createLeadership(me.id, data);
    await bumpCmsRev();
    return { leadership };
  });

export const updateLeadershipFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.partial().extend({ id: ID }).parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { updateLeadership } = await import("@/features/leadership");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    const leadership = await updateLeadership(me.id, data);
    await bumpCmsRev();
    return { leadership };
  });

export const deleteLeadershipFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: ID }).parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { deleteLeadership } = await import("@/features/leadership");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("admin");
    await deleteLeadership(me.id, data.id);
    await bumpCmsRev();
    return { ok: true as const };
  });

export const reorderLeadershipFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ orderedIds: z.array(ID) }).parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { reorderLeadership } = await import("@/features/leadership");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    await reorderLeadership(me.id, data.orderedIds);
    await bumpCmsRev();
    return { ok: true as const };
  });
