import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type {
  ShippingLocale,
  ShippingRouteRow,
  ShippingStatus,
  ShippingTableRow,
} from "@/features/shipping";

const LOCALE = z.enum(["en", "vi", "zh"]);
const STATUS = z.enum(["draft", "live", "archived"]);

export const listShippingRoutesFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { listShippingRoutesGrouped } = await import("@/features/shipping");
  await requireSession("viewer");
  return { groups: await listShippingRoutesGrouped() };
});

export const getShippingRouteDetailFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ slug: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { getShippingRoute, getShippingRouteForPublic, getShippingTables } = await import(
      "@/features/shipping"
    );
    const type = await import("@/features/shipping/shipping.service");
    type Row = Awaited<ReturnType<typeof type.getShippingTables>>;
    await requireSession("viewer");
    // EN/ZH read from shipping_route_translations via ForPublic; VI stays
    // canonical. Tables (nested shipping_route_tables) only have a single
    // copy keyed to the VI source row — per-locale table translation is the
    // deferred follow-up flagged in migration 0027.
    const [en, vi, zh] = await Promise.all([
      getShippingRouteForPublic(data.slug, "en"),
      getShippingRoute(data.slug, "vi"),
      getShippingRouteForPublic(data.slug, "zh"),
    ]);
    const tables: { en: Row; vi: Row; zh: Row } = { en: [], vi: [], zh: [] };
    if (vi) {
      const viTables = await getShippingTables(vi.id);
      tables.vi = viTables;
      tables.en = viTables;
      tables.zh = viTables;
    }
    return { slug: data.slug, variants: { en, vi, zh }, tables };
  });

const upsertSchema = z.object({
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  locale: LOCALE,
  position: z.number().int().min(0).optional(),
  title: z.string().min(1).max(500),
  origin: z.string().max(50).nullable().optional(),
  destination: z.string().max(50).nullable().optional(),
  kind: z.string().max(100).nullable().optional(),
  body_md: z.string().max(20000).nullable().optional(),
  notes: z.array(z.string().max(2000)).max(50).nullable().optional(),
  status: STATUS.optional(),
});

export const upsertShippingRouteFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => upsertSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { upsertShippingRoute } = await import("@/features/shipping");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    const route = await upsertShippingRoute(me.id, data);
    await bumpCmsRev();
    return { route };
  });

const tablesSchema = z.object({
  slug: z.string().min(1),
  locale: LOCALE,
  tables: z.array(
    z.object({
      caption: z.string().max(500).nullable().optional(),
      columns: z.array(z.object({ key: z.string().max(100), label: z.string().max(200) })).max(50),
      rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))).max(500),
    }),
  ).max(20),
});

export const replaceShippingTablesFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => tablesSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { replaceShippingTables } = await import("@/features/shipping");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    const tables = await replaceShippingTables(me.id, data);
    await bumpCmsRev();
    return { tables };
  });

export const deleteShippingRouteSlugFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ slug: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { deleteShippingRouteSlug } = await import("@/features/shipping");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    await deleteShippingRouteSlug(me.id, data.slug);
    await bumpCmsRev();
    return { ok: true as const };
  });
