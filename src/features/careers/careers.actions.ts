import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type {
  ApplicantStatus,
  CareerLocale,
  CareerStatus,
  CareersApplicantRow,
  CareersJobRow,
} from "@/features/careers";

const LOCALE = z.enum(["en", "vi", "zh"]);
const STATUS = z.enum(["open", "closed", "archived"]);
const APP_STATUS = z.enum(["new", "reviewing", "interview", "offer", "rejected", "archived"]);

// ─────────────── reads ───────────────

export const listCareersJobsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { listCareersJobsGrouped } = await import("@/features/careers");
  await requireSession("viewer");
  return { groups: await listCareersJobsGrouped() };
});

export const getCareersJobDetailFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ slug: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { getCareersJob, getCareersJobForPublic } = await import("@/features/careers");
    await requireSession("viewer");
    // VI: read source (canonical). EN/ZH: read from careers_job_translations
    // via the ForPublic JOIN so admin sees the same content the public website
    // serves — the legacy careers_jobs.locale='en'/'zh' rows have been
    // superseded by the translations table since migration 0023. When the
    // translation is draft/stale/failed (not reviewed), the admin EN/ZH tab
    // shows null and the operator uses the Sparkles dialog to manage it.
    const [en, vi, zh] = await Promise.all([
      getCareersJobForPublic(data.slug, "en"),
      getCareersJob(data.slug, "vi"),
      getCareersJobForPublic(data.slug, "zh"),
    ]);
    return { slug: data.slug, variants: { en, vi, zh } };
  });

export const listCareersApplicantsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { listApplicants } = await import("@/features/careers");
  await requireSession("viewer");
  return { applicants: await listApplicants({ limit: 200 }) };
});

// ─────────────── job mutations ───────────────

const responsibilitiesSchema = z.record(z.string(), z.array(z.string().max(500)).max(50));
const requirementsSchema = z.array(z.string().max(500)).max(50);
const benefitsSchema = z.array(
  z.object({ i: z.string().max(50), t: z.string().max(200), d: z.string().max(500) }),
).max(50);
const bonusesSchema = z.array(z.string().max(500)).max(50);

const upsertSchema = z.object({
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/, "slug chỉ gồm chữ thường, số, dấu gạch ngang"),
  locale: LOCALE,
  title: z.string().min(1).max(500),
  body_md: z.string().max(20000).optional(),
  location: z.string().max(200).nullable().optional(),
  employment_type: z.string().max(100).nullable().optional(),
  status: STATUS.optional(),
  category: z.string().max(100).nullable().optional(),
  hot: z.boolean().optional(),
  badge: z.string().max(100).nullable().optional(),
  tagline: z.string().max(500).nullable().optional(),
  salary: z.string().max(100).nullable().optional(),
  salary_unit: z.string().max(50).nullable().optional(),
  salary_note: z.string().max(500).nullable().optional(),
  deadline: z.string().max(50).nullable().optional(),
  experience: z.string().max(100).nullable().optional(),
  lead: z.string().max(2000).nullable().optional(),
  responsibilities: responsibilitiesSchema.nullable().optional(),
  requirements: requirementsSchema.nullable().optional(),
  benefits: benefitsSchema.nullable().optional(),
  bonuses: bonusesSchema.nullable().optional(),
  position: z.number().int().min(0).optional(),
  posted_at: z.number().int().min(0).optional(), // epoch seconds — editable posted date
});

export const upsertCareersJobFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => upsertSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { upsertCareersJob } = await import("@/features/careers");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    const job = await upsertCareersJob(me.id, data);
    await bumpCmsRev();
    return { job };
  });

export const deleteCareersJobFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ slug: z.string().min(1), locale: LOCALE }).parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { deleteCareersJob } = await import("@/features/careers");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    await deleteCareersJob(me.id, data.slug, data.locale);
    await bumpCmsRev();
    return { ok: true as const };
  });

export const deleteCareersJobSlugFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ slug: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { deleteCareersJobSlug } = await import("@/features/careers");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    await deleteCareersJobSlug(me.id, data.slug);
    await bumpCmsRev();
    return { ok: true as const };
  });

// ─────────────── applicant admin actions ───────────────

export const updateApplicantStatusFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ id: z.number().int().positive(), status: APP_STATUS }).parse(data),
  )
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { updateApplicantStatus } = await import("@/features/careers");
    const me = await requireSession("editor");
    await updateApplicantStatus(me.id, data);
    return { ok: true as const };
  });

export const deleteApplicantFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.number().int().positive() }).parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { deleteApplicant } = await import("@/features/careers");
    const me = await requireSession("admin");
    await deleteApplicant(me.id, data.id);
    return { ok: true as const };
  });
