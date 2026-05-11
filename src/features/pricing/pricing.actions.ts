import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type {
  PricingCategory,
  PricingKind,
  PricingStatus,
  PricingTableRow,
  PricingTableSummary,
} from "@/features/pricing";

export const listPricingTablesFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { listPricingTables } = await import("@/features/pricing");
  await requireSession("viewer");
  return { categories: await listPricingTables() };
});

const slugSchema = z.object({ slug: z.string().min(1) });

export const getPricingTableFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => slugSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { getPricingTable } = await import("@/features/pricing");
    await requireSession("viewer");
    const table = await getPricingTable(data.slug);
    return { table };
  });

const saveSchema = z.object({
  slug: z.string().min(1),
  data_json: z.string().min(2), // at least "[]" or "{}"
  schema_json: z.string().optional(),
  comment: z.string().max(500).optional().nullable(),
});

export const savePricingTableFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => saveSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { savePricingTable } = await import("@/features/pricing");
    const { env } = await import("cloudflare:workers");
    const me = await requireSession("editor"); // editor + admin can save pricing
    const result = await savePricingTable({
      slug: data.slug,
      data_json: data.data_json,
      schema_json: data.schema_json,
      comment: data.comment ?? null,
      actorId: me.id,
    });
    // Bump cms:rev so /api/v1/pricing/* edge cache invalidates
    await env.CMS_REV.put("rev", String(Date.now()));
    return result;
  });

export const listPricingVersionsFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => slugSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { listPricingVersions } = await import("@/features/pricing");
    await requireSession("viewer");
    const versions = await listPricingVersions(data.slug, 20);
    return { versions };
  });
