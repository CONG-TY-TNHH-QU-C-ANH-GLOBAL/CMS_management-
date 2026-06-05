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
    const { getShippingRoute, getShippingRouteForPublic, getShippingTablesForSlug } =
      await import("@/features/shipping");
    const type = await import("@/features/shipping/shipping.service");
    type Row = Awaited<ReturnType<typeof type.getShippingTables>>;
    await requireSession("viewer");
    // EN/ZH content reads from shipping_route_translations via ForPublic (with
    // legacy fallback). VI content stays canonical. Tables (nested
    // shipping_route_tables) are resolved via (slug, locale) directly because
    // route.id from ForPublic may point at the VI source row id which has no
    // tables hung off it — see getShippingTablesForSlug comment for details.
    const [en, vi, zh, enTables, viTables, zhTables] = await Promise.all([
      getShippingRouteForPublic(data.slug, "en"),
      getShippingRoute(data.slug, "vi"),
      getShippingRouteForPublic(data.slug, "zh"),
      getShippingTablesForSlug(data.slug, "en"),
      getShippingTablesForSlug(data.slug, "vi"),
      getShippingTablesForSlug(data.slug, "zh"),
    ]);
    const tables: { en: Row; vi: Row; zh: Row } = {
      en: enTables,
      vi: viTables,
      zh: zhTables,
    };
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
  // body_md holds AI-translated markdown. Vietnamese output runs ~1.5-2× the
  // English source, and the translate/sync paths write straight to the DB with
  // NO cap — so a global route's VI body can land well past the old 20k bound,
  // then fail re-save here (the "too_big at 20000" the CMS surfaced). Match the
  // unbounded body_md the careers/policies schemas use, with a generous guard.
  body_md: z.string().max(200000).nullable().optional(),
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

// Any-source AI translation: translate the given route's content from
// `source_locale` into the other locales (or an explicit target list). Unlike
// the VI-only Sparkles pipeline, source can be any locale — built for shipping
// where the master content may be English, Vietnamese, or Chinese.
export const translateShippingRouteFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        slug: z.string().min(1),
        source_locale: LOCALE,
        target_locales: z.array(LOCALE).min(1).max(3).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { env } = await import("cloudflare:workers");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { translateShippingRouteContent } = await import("@/features/shipping");
    const me = await requireSession("editor");
    if (!env.OPENAI_API_KEY) {
      throw Object.assign(new Error("OPENAI_API_KEY chưa được set trên Worker."), { statusCode: 503 });
    }
    const result = await translateShippingRouteContent(
      me.id,
      env.OPENAI_API_KEY,
      {
        slug: data.slug,
        sourceLocale: data.source_locale,
        targetLocales: data.target_locales,
      },
      env.OPENAI_BASE_URL,
    );
    await bumpCmsRev();
    return result;
  });

// Phase 2: enqueue an async, resumable translation job instead of translating
// synchronously. Creates the job + chunk rows and returns the job id; the
// client then drives it via pumpTranslationJobFn / getTranslationJobFn, with
// the Cron Trigger as the resume backstop. Preferred over translateShippingRouteFn
// for large routes that would otherwise risk a request timeout.
export const enqueueShippingTranslateFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        slug: z.string().min(1),
        source_locale: LOCALE,
        target_locales: z.array(LOCALE).min(1).max(3).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { env } = await import("cloudflare:workers");
    const { getShippingRoute } = await import("@/features/shipping");
    const { createTranslationJob } = await import(
      "@/features/translations/translation-jobs.service"
    );
    const me = await requireSession("editor");
    if (!env.OPENAI_API_KEY) {
      throw Object.assign(new Error("OPENAI_API_KEY chưa được set trên Worker."), { statusCode: 503 });
    }
    const source = await getShippingRoute(data.slug, data.source_locale);
    const body = (source?.body_md ?? "").trim();
    if (!body) {
      throw Object.assign(new Error("Nội dung nguồn đang trống — không có gì để dịch."), { statusCode: 400 });
    }
    const targets = (data.target_locales ?? (["en", "vi", "zh"] as const).filter((l) => l !== data.source_locale));
    const created = await createTranslationJob({
      entityType: "shipping_route",
      entityRef: data.slug,
      sourceLocale: data.source_locale,
      sourceText: body,
      targetLocales: targets as ("en" | "vi" | "zh")[],
      createdBy: me.id,
    });
    if (!created) return { jobId: null, totalChunks: 0, skipped: true as const };
    return { jobId: created.jobId, totalChunks: created.totalChunks, skipped: false as const };
  });
