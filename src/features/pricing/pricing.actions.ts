import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type {
  PricingCategory,
  PricingKind,
  PricingStatus,
  PricingTableRow,
  PricingTableSummary,
  PricingVersionRow,
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
  expectedVersion: z.number().int().nonnegative().optional(),
});

export const savePricingTableFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => saveSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { savePricingTable } = await import("@/features/pricing");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor"); // editor + admin can save pricing
    const result = await savePricingTable({
      slug: data.slug,
      data_json: data.data_json,
      schema_json: data.schema_json,
      comment: data.comment ?? null,
      actorId: me.id,
      expectedVersion: data.expectedVersion,
    });
    // Invalidate the edge cache AND queue a landing rebuild: the prerendered
    // pricing pages bake these numbers into static HTML.
    await bumpCmsRev();
    return result;
  });

const rollbackSchema = z.object({
  slug: z.string().min(1),
  toVersion: z.number().int().positive(),
});

export const rollbackPricingTableFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => rollbackSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { rollbackPricingTable } = await import("@/features/pricing");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    const result = await rollbackPricingTable({
      slug: data.slug,
      toVersion: data.toVersion,
      actorId: me.id,
    });
    await bumpCmsRev();
    return result;
  });

const money = z.number().finite().nonnegative();
const uspsGaRowSchema = z.object({
  oz: z.number().positive(),
  g: money,
  z1: money,
  z2: money,
  z3: money,
  z4: money,
  z5: money,
  z6: money,
  z7: money,
  z8: money,
  z9: money,
});
const uspsGaSaveSchema = z.object({
  tiers: z.array(z.array(uspsGaRowSchema).length(24)).length(5),
  expectedVersions: z.array(z.number().int().positive()).length(5),
  comment: z.string().max(500).optional().nullable(),
});

/** Publish all five USPS Ground Advantage label tiers from one uploaded workbook. */
export const saveUspsGaTiersFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => uspsGaSaveSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { saveUspsGaTiers } = await import("@/features/pricing");
    const { auditLog, bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    const result = await saveUspsGaTiers({
      tiers: data.tiers,
      expectedVersions: data.expectedVersions,
      comment: data.comment ?? null,
      actorId: me.id,
    });
    await auditLog(me.id, "publish", "pricing_usps_ga", null, null, {
      newVersions: result.newVersions,
    });
    await bumpCmsRev();
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
