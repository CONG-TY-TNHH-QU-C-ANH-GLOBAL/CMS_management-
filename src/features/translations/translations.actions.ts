// RPC stubs for the translation worker + lifecycle actions.
// Pattern mirrors copilot.actions.ts and content.actions.ts.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type { FaqTranslationRow } from "./faq.translation.service";
export type { ServiceBlockTranslationRow } from "./service-block.translation.service";
export type { TestimonialTranslationRow } from "./testimonial.translation.service";
export type { HomepageBlockTranslationRow } from "./homepage-block.translation.service";
export type { CareersJobTranslationRow } from "./careers-job.translation.service";
export type { BlogPostTranslationRow } from "./blog-post.translation.service";
export type { PolicyTranslationRow } from "./policy.translation.service";
export type { ContactLocationTranslationRow } from "./contact-location.translation.service";
export type { ShippingRouteTranslationRow } from "./shipping-route.translation.service";
export type { AiTranslationLogRow } from "./translations.log.service";

const ID = z.number().int().positive();
const TARGET_LOCALE = z.enum(["en", "zh"]);
const ENTITY_TYPE = z.enum([
  "faq",
  "service_block",
  "testimonial",
  "homepage_block",
  "careers_job",
  "blog_post",
  "policy",
  "contact_location",
  "shipping_route",
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

// ─────────────── Phase 8: blog_post lifecycle RPC ───────────────

export const listBlogPostTranslationsFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ blog_post_id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { listBlogPostTranslationsForId } = await import(
      "./blog-post.translation.service"
    );
    await requireSession("viewer");
    return await listBlogPostTranslationsForId(data.blog_post_id);
  });

export const listAllBlogPostTranslationsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireSession } = await import("@/features/auth");
    const { listAllBlogPostTranslations } = await import("./blog-post.translation.service");
    await requireSession("viewer");
    return await listAllBlogPostTranslations();
  },
);

export const approveBlogPostTranslationFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { approveBlogPostTranslation } = await import("./blog-post.translation.service");
    const me = await requireSession("editor");
    const result = await approveBlogPostTranslation(me.id, data.id);
    await bumpCmsRev();
    return result;
  });

export const editBlogPostTranslationFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        id: ID,
        title: z.string().trim().min(1).max(2000),
        excerpt: z.string().max(5000).nullable(),
        category: z.string().max(200).nullable(),
        seo_title: z.string().max(2000).nullable(),
        seo_description: z.string().max(5000).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { editBlogPostTranslation } = await import("./blog-post.translation.service");
    const me = await requireSession("editor");
    const result = await editBlogPostTranslation(me.id, data);
    await bumpCmsRev();
    return result;
  });

export const deleteBlogPostTranslationFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { deleteBlogPostTranslation } = await import("./blog-post.translation.service");
    const me = await requireSession("editor");
    await deleteBlogPostTranslation(me.id, data.id);
    await bumpCmsRev();
    return { ok: true as const };
  });

export const markBlogPostTranslationStaleFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { markBlogPostTranslationStale } = await import("./blog-post.translation.service");
    const me = await requireSession("editor");
    const result = await markBlogPostTranslationStale(me.id, data.id);
    await bumpCmsRev();
    return result;
  });

// ─────────────── Phase 8: policy lifecycle RPC ───────────────

export const listPolicyTranslationsFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ policy_id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { listPolicyTranslationsForId } = await import("./policy.translation.service");
    await requireSession("viewer");
    return await listPolicyTranslationsForId(data.policy_id);
  });

export const listAllPolicyTranslationsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireSession } = await import("@/features/auth");
    const { listAllPolicyTranslations } = await import("./policy.translation.service");
    await requireSession("viewer");
    return await listAllPolicyTranslations();
  },
);

export const approvePolicyTranslationFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { approvePolicyTranslation } = await import("./policy.translation.service");
    const me = await requireSession("editor");
    const result = await approvePolicyTranslation(me.id, data.id);
    await bumpCmsRev();
    return result;
  });

export const editPolicyTranslationFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        id: ID,
        title: z.string().trim().min(1).max(2000),
        body_md: z.string().max(50000),
        summary: z.string().max(5000).nullable(),
        text_blocks_json: z.string().max(50000).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { editPolicyTranslation } = await import("./policy.translation.service");
    const me = await requireSession("editor");
    const result = await editPolicyTranslation(me.id, data);
    await bumpCmsRev();
    return result;
  });

export const deletePolicyTranslationFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { deletePolicyTranslation } = await import("./policy.translation.service");
    const me = await requireSession("editor");
    await deletePolicyTranslation(me.id, data.id);
    await bumpCmsRev();
    return { ok: true as const };
  });

export const markPolicyTranslationStaleFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { markPolicyTranslationStale } = await import("./policy.translation.service");
    const me = await requireSession("editor");
    const result = await markPolicyTranslationStale(me.id, data.id);
    await bumpCmsRev();
    return result;
  });

// ─────────────── Phase 8: contact_location lifecycle RPC ───────────────

export const listContactLocationTranslationsFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ contact_location_id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { listContactLocationTranslationsForId } = await import(
      "./contact-location.translation.service"
    );
    await requireSession("viewer");
    return await listContactLocationTranslationsForId(data.contact_location_id);
  });

export const listAllContactLocationTranslationsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireSession } = await import("@/features/auth");
    const { listAllContactLocationTranslations } = await import(
      "./contact-location.translation.service"
    );
    await requireSession("viewer");
    return await listAllContactLocationTranslations();
  },
);

export const approveContactLocationTranslationFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { approveContactLocationTranslation } = await import(
      "./contact-location.translation.service"
    );
    const me = await requireSession("editor");
    const result = await approveContactLocationTranslation(me.id, data.id);
    await bumpCmsRev();
    return result;
  });

export const editContactLocationTranslationFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        id: ID,
        label: z.string().trim().min(1).max(500),
        address: z.string().max(2000).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { editContactLocationTranslation } = await import(
      "./contact-location.translation.service"
    );
    const me = await requireSession("editor");
    const result = await editContactLocationTranslation(me.id, data);
    await bumpCmsRev();
    return result;
  });

export const deleteContactLocationTranslationFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { deleteContactLocationTranslation } = await import(
      "./contact-location.translation.service"
    );
    const me = await requireSession("editor");
    await deleteContactLocationTranslation(me.id, data.id);
    await bumpCmsRev();
    return { ok: true as const };
  });

export const markContactLocationTranslationStaleFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { markContactLocationTranslationStale } = await import(
      "./contact-location.translation.service"
    );
    const me = await requireSession("editor");
    const result = await markContactLocationTranslationStale(me.id, data.id);
    await bumpCmsRev();
    return result;
  });

// ─────────────── Phase 8: shipping_route lifecycle RPC ───────────────

export const listShippingRouteTranslationsFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ shipping_route_id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { listShippingRouteTranslationsForId } = await import(
      "./shipping-route.translation.service"
    );
    await requireSession("viewer");
    return await listShippingRouteTranslationsForId(data.shipping_route_id);
  });

export const listAllShippingRouteTranslationsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireSession } = await import("@/features/auth");
    const { listAllShippingRouteTranslations } = await import(
      "./shipping-route.translation.service"
    );
    await requireSession("viewer");
    return await listAllShippingRouteTranslations();
  },
);

export const approveShippingRouteTranslationFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { approveShippingRouteTranslation } = await import(
      "./shipping-route.translation.service"
    );
    const me = await requireSession("editor");
    const result = await approveShippingRouteTranslation(me.id, data.id);
    await bumpCmsRev();
    return result;
  });

export const editShippingRouteTranslationFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        id: ID,
        title: z.string().trim().min(1).max(2000),
        body_md: z.string().max(50000).nullable(),
        notes_json: z.string().max(20000).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { editShippingRouteTranslation } = await import(
      "./shipping-route.translation.service"
    );
    const me = await requireSession("editor");
    const result = await editShippingRouteTranslation(me.id, data);
    await bumpCmsRev();
    return result;
  });

export const deleteShippingRouteTranslationFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { deleteShippingRouteTranslation } = await import(
      "./shipping-route.translation.service"
    );
    const me = await requireSession("editor");
    await deleteShippingRouteTranslation(me.id, data.id);
    await bumpCmsRev();
    return { ok: true as const };
  });

export const markShippingRouteTranslationStaleFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { markShippingRouteTranslationStale } = await import(
      "./shipping-route.translation.service"
    );
    const me = await requireSession("editor");
    const result = await markShippingRouteTranslationStale(me.id, data.id);
    await bumpCmsRev();
    return result;
  });
