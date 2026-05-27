// RPC stubs for the translation worker + lifecycle actions.
// Pattern mirrors copilot.actions.ts and content.actions.ts.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type { FaqTranslationRow } from "./faq.translation.service";
export type { ServiceBlockTranslationRow } from "./service-block.translation.service";
export type { TestimonialTranslationRow } from "./testimonial.translation.service";
export type { HomepageBlockTranslationRow } from "./homepage-block.translation.service";
export type { CareersJobTranslationRow } from "./careers-job.translation.service";
export type { AiTranslationLogRow } from "./translations.log.service";

const ID = z.number().int().positive();
const TARGET_LOCALE = z.enum(["en", "zh"]);
const ENTITY_TYPE = z.enum([
  "faq",
  "service_block",
  "testimonial",
  "homepage_block",
  "careers_job",
]);

const translateSchema = z.object({
  entity_type: ENTITY_TYPE,
  entity_id: ID,
  target_locales: z.array(TARGET_LOCALE).min(1).max(2),
  model: z.enum(["gpt-4o-mini", "gpt-4o"]).optional(),
  prompt_version: z.string().max(40).optional(),
});

// ───────────────────────────── reads ─────────────────────────────

export const listFaqTranslationsFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ faq_id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { listFaqTranslationsForId } = await import("./faq.translation.service");
    await requireSession("viewer");
    return { rows: await listFaqTranslationsForId(data.faq_id) };
  });

/** All translation rows across every FAQ. Used by the admin index loader so
 *  VI rows can render inline EN/ZH status pills without N+1 fetches. */
export const listAllFaqTranslationsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { listAllFaqTranslations } = await import("./faq.translation.service");
  await requireSession("viewer");
  return { rows: await listAllFaqTranslations() };
});

export const listAiTranslationLogsFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        entity_type: ENTITY_TYPE,
        entity_id: ID,
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { listAiTranslationLogsForEntity } = await import("./translations.log.service");
    await requireSession("viewer");
    return {
      logs: await listAiTranslationLogsForEntity(
        data.entity_type,
        data.entity_id,
        data.limit ?? 20,
      ),
    };
  });

// ───────────────────────────── writes ─────────────────────────────

/** POST /api/admin/translate (effectively — TanStack server function). Calls
 *  OpenAI, upserts translation rows, writes log row, returns drafts.
 *  Per-locale partial failure: response includes per-locale outcome. */
export const translateFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => translateSchema.parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { env } = await import("cloudflare:workers");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const {
      translate,
      OpenAiKeyMissingError,
      TranslationInFlightError,
      TranslationSourceNotFoundError,
    } = await import("./translations.service");

    const me = await requireSession("editor");
    if (!env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY chưa được set trên Worker.");
    }

    try {
      const result = await translate(env.OPENAI_API_KEY, me.id, data, env.OPENAI_BASE_URL);
      // Public API edge cache invalidates so next /api/v1/faqs?lang=… picks up
      // the new in_flight_until clears (and reviewed rows when operator approves).
      await bumpCmsRev();
      return result;
    } catch (err) {
      if (err instanceof TranslationInFlightError) {
        throw Object.assign(new Error(err.message), { statusCode: 409 });
      }
      if (err instanceof TranslationSourceNotFoundError) {
        throw Object.assign(new Error(err.message), { statusCode: 404 });
      }
      if (err instanceof OpenAiKeyMissingError) {
        throw Object.assign(new Error(err.message), { statusCode: 503 });
      }
      throw err;
    }
  });

export const approveFaqTranslationFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { approveFaqTranslation } = await import("./faq.translation.service");
    const me = await requireSession("editor");
    const result = await approveFaqTranslation(me.id, data.id);
    await bumpCmsRev();
    return result;
  });

export const editFaqTranslationFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        id: ID,
        question: z.string().trim().min(1).max(5000),
        answer: z.string().trim().min(1).max(10000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { editFaqTranslation } = await import("./faq.translation.service");
    const me = await requireSession("editor");
    const result = await editFaqTranslation(me.id, data);
    await bumpCmsRev();
    return result;
  });

export const deleteFaqTranslationFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { deleteFaqTranslation } = await import("./faq.translation.service");
    const me = await requireSession("editor");
    await deleteFaqTranslation(me.id, data.id);
    await bumpCmsRev();
    return { ok: true as const };
  });

export const markFaqTranslationStaleFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { markFaqTranslationStale } = await import("./faq.translation.service");
    const me = await requireSession("editor");
    const result = await markFaqTranslationStale(me.id, data.id);
    await bumpCmsRev();
    return result;
  });

// ─────────────── Phase 6: service_block lifecycle RPC ───────────────

export const listServiceBlockTranslationsFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ service_block_id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { listServiceBlockTranslationsForId } = await import(
      "./service-block.translation.service"
    );
    await requireSession("viewer");
    return await listServiceBlockTranslationsForId(data.service_block_id);
  });

export const listAllServiceBlockTranslationsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireSession } = await import("@/features/auth");
    const { listAllServiceBlockTranslations } = await import(
      "./service-block.translation.service"
    );
    await requireSession("viewer");
    return await listAllServiceBlockTranslations();
  },
);

export const approveServiceBlockTranslationFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { approveServiceBlockTranslation } = await import(
      "./service-block.translation.service"
    );
    const me = await requireSession("editor");
    const result = await approveServiceBlockTranslation(me.id, data.id);
    await bumpCmsRev();
    return result;
  });

export const editServiceBlockTranslationFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        id: ID,
        title: z.string().max(2000).nullable(),
        description: z.string().max(20000).nullable(),
        payload_json: z.string().max(50000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { editServiceBlockTranslation } = await import("./service-block.translation.service");
    const me = await requireSession("editor");
    const result = await editServiceBlockTranslation(me.id, data);
    await bumpCmsRev();
    return result;
  });

export const deleteServiceBlockTranslationFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { deleteServiceBlockTranslation } = await import(
      "./service-block.translation.service"
    );
    const me = await requireSession("editor");
    await deleteServiceBlockTranslation(me.id, data.id);
    await bumpCmsRev();
    return { ok: true as const };
  });

export const markServiceBlockTranslationStaleFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { markServiceBlockTranslationStale } = await import(
      "./service-block.translation.service"
    );
    const me = await requireSession("editor");
    const result = await markServiceBlockTranslationStale(me.id, data.id);
    await bumpCmsRev();
    return result;
  });

// ─────────────── Phase 6: testimonial lifecycle RPC ───────────────

export const listTestimonialTranslationsFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ testimonial_id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { listTestimonialTranslationsForId } = await import(
      "./testimonial.translation.service"
    );
    await requireSession("viewer");
    return await listTestimonialTranslationsForId(data.testimonial_id);
  });

export const listAllTestimonialTranslationsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireSession } = await import("@/features/auth");
    const { listAllTestimonialTranslations } = await import(
      "./testimonial.translation.service"
    );
    await requireSession("viewer");
    return await listAllTestimonialTranslations();
  },
);

export const approveTestimonialTranslationFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { approveTestimonialTranslation } = await import(
      "./testimonial.translation.service"
    );
    const me = await requireSession("editor");
    const result = await approveTestimonialTranslation(me.id, data.id);
    await bumpCmsRev();
    return result;
  });

export const editTestimonialTranslationFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        id: ID,
        quote: z.string().trim().min(1).max(5000),
        author_role: z.string().max(500).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { editTestimonialTranslation } = await import("./testimonial.translation.service");
    const me = await requireSession("editor");
    const result = await editTestimonialTranslation(me.id, data);
    await bumpCmsRev();
    return result;
  });

export const deleteTestimonialTranslationFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { deleteTestimonialTranslation } = await import(
      "./testimonial.translation.service"
    );
    const me = await requireSession("editor");
    await deleteTestimonialTranslation(me.id, data.id);
    await bumpCmsRev();
    return { ok: true as const };
  });

export const markTestimonialTranslationStaleFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { markTestimonialTranslationStale } = await import(
      "./testimonial.translation.service"
    );
    const me = await requireSession("editor");
    const result = await markTestimonialTranslationStale(me.id, data.id);
    await bumpCmsRev();
    return result;
  });

// ─────────────── Phase 7: homepage_block lifecycle RPC ───────────────

export const listHomepageBlockTranslationsFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ homepage_block_id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { listHomepageBlockTranslationsForId } = await import(
      "./homepage-block.translation.service"
    );
    await requireSession("viewer");
    return await listHomepageBlockTranslationsForId(data.homepage_block_id);
  });

export const listAllHomepageBlockTranslationsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireSession } = await import("@/features/auth");
    const { listAllHomepageBlockTranslations } = await import(
      "./homepage-block.translation.service"
    );
    await requireSession("viewer");
    return await listAllHomepageBlockTranslations();
  },
);

export const approveHomepageBlockTranslationFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { approveHomepageBlockTranslation } = await import(
      "./homepage-block.translation.service"
    );
    const me = await requireSession("editor");
    const result = await approveHomepageBlockTranslation(me.id, data.id);
    await bumpCmsRev();
    return result;
  });

export const editHomepageBlockTranslationFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ id: ID, payload_json: z.string().max(50000) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { editHomepageBlockTranslation } = await import(
      "./homepage-block.translation.service"
    );
    const me = await requireSession("editor");
    const result = await editHomepageBlockTranslation(me.id, data);
    await bumpCmsRev();
    return result;
  });

export const deleteHomepageBlockTranslationFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { deleteHomepageBlockTranslation } = await import(
      "./homepage-block.translation.service"
    );
    const me = await requireSession("editor");
    await deleteHomepageBlockTranslation(me.id, data.id);
    await bumpCmsRev();
    return { ok: true as const };
  });

export const markHomepageBlockTranslationStaleFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { markHomepageBlockTranslationStale } = await import(
      "./homepage-block.translation.service"
    );
    const me = await requireSession("editor");
    const result = await markHomepageBlockTranslationStale(me.id, data.id);
    await bumpCmsRev();
    return result;
  });

// ─────────────── Phase 8: careers_job lifecycle RPC ───────────────

export const listCareersJobTranslationsFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ careers_job_id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { listCareersJobTranslationsForId } = await import(
      "./careers-job.translation.service"
    );
    await requireSession("viewer");
    return await listCareersJobTranslationsForId(data.careers_job_id);
  });

export const listAllCareersJobTranslationsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireSession } = await import("@/features/auth");
    const { listAllCareersJobTranslations } = await import(
      "./careers-job.translation.service"
    );
    await requireSession("viewer");
    return await listAllCareersJobTranslations();
  },
);

export const approveCareersJobTranslationFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { approveCareersJobTranslation } = await import(
      "./careers-job.translation.service"
    );
    const me = await requireSession("editor");
    const result = await approveCareersJobTranslation(me.id, data.id);
    await bumpCmsRev();
    return result;
  });

export const editCareersJobTranslationFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        id: ID,
        title: z.string().max(2000).nullable(),
        body_md: z.string().max(50000).nullable(),
        tagline: z.string().max(2000).nullable(),
        salary_note: z.string().max(2000).nullable(),
        experience: z.string().max(2000).nullable(),
        lead: z.string().max(5000).nullable(),
        responsibilities_json: z.string().max(50000),
        requirements_json: z.string().max(20000),
        benefits_json: z.string().max(20000),
        bonuses_json: z.string().max(20000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { editCareersJobTranslation } = await import("./careers-job.translation.service");
    const me = await requireSession("editor");
    const result = await editCareersJobTranslation(me.id, data);
    await bumpCmsRev();
    return result;
  });

export const deleteCareersJobTranslationFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { deleteCareersJobTranslation } = await import(
      "./careers-job.translation.service"
    );
    const me = await requireSession("editor");
    await deleteCareersJobTranslation(me.id, data.id);
    await bumpCmsRev();
    return { ok: true as const };
  });

export const markCareersJobTranslationStaleFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { markCareersJobTranslationStale } = await import(
      "./careers-job.translation.service"
    );
    const me = await requireSession("editor");
    const result = await markCareersJobTranslationStale(me.id, data.id);
    await bumpCmsRev();
    return result;
  });
