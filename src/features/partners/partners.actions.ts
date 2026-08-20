import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type { PartnerRow } from "./partners.service";

const ID = z.number().int().positive();
const STATUS = z.enum(["draft", "live"]);

export const listPartnersFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { listPartners } = await import("@/features/partners");
  await requireSession("viewer");
  return { partners: await listPartners() };
});

const partnerCreate = z.object({
  position: z.number().int().min(0),
  name: z.string().min(1).max(100),
  logo_media_id: ID.nullable().optional(),
  url: z.string().url().max(500).nullable().optional(),
  tier: z.string().max(60).nullable().optional(),
  status: STATUS.optional(),
});

export const createPartnerFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => partnerCreate.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { createPartner } = await import("@/features/partners");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    const partner = await createPartner(me.id, data);
    await bumpCmsRev();
    return { partner };
  });

const partnerUpdate = z.object({
  id: ID,
  position: z.number().int().min(0).optional(),
  name: z.string().min(1).max(100).optional(),
  logo_media_id: ID.nullable().optional(),
  url: z.string().url().max(500).nullable().optional(),
  tier: z.string().max(60).nullable().optional(),
  status: STATUS.optional(),
});

export const updatePartnerFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => partnerUpdate.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { updatePartner } = await import("@/features/partners");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    const partner = await updatePartner(me.id, data);
    await bumpCmsRev();
    return { partner };
  });

export const deletePartnerFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: ID }).parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { deletePartner } = await import("@/features/partners");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("admin");
    await deletePartner(me.id, data.id);
    await bumpCmsRev();
    return { ok: true as const };
  });

export const reorderPartnersFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ orderedIds: z.array(ID) }).parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { reorderPartners } = await import("@/features/partners");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    await reorderPartners(me.id, data.orderedIds);
    await bumpCmsRev();
    return { ok: true as const };
  });
