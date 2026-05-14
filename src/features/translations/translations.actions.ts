// RPC stubs for the translation worker + lifecycle actions.
// Pattern mirrors copilot.actions.ts and content.actions.ts.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type { FaqTranslationRow } from "./faq.translation.service";
export type { AiTranslationLogRow } from "./translations.log.service";

const ID = z.number().int().positive();
const TARGET_LOCALE = z.enum(["en", "zh"]);
const ENTITY_TYPE = z.enum(["faq"]); // Phase 1 scope

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
      const result = await translate(env.OPENAI_API_KEY, me.id, data);
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
