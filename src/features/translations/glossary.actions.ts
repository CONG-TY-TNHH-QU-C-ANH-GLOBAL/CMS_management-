// RPC stubs for the glossary admin UI. Read + write.
// Pattern mirrors features/content/content.actions.ts.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type { GlossaryCategory, GlossaryRow } from "./glossary.service";

const ID = z.number().int().positive();
const CATEGORY = z.enum([
  "shipping",
  "warehouse",
  "ecommerce",
  "payments",
  "marketing",
  "brand",
  "general",
]);

const TERM_FIELDS = {
  term_vi: z.string().trim().min(1, "Cần có term VI").max(200),
  term_en: z.string().trim().min(1, "Cần có term EN").max(200),
  term_zh: z.string().trim().min(1, "Cần có term ZH").max(200),
  category: CATEGORY,
  notes: z.string().max(500).nullish(),
  priority: z.number().int().min(0).max(100).optional(),
};

// ───────────────────────────── reads ─────────────────────────────

export const listGlossaryFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { listGlossary } = await import("./glossary.service");
  await requireSession("viewer");
  return { glossary: await listGlossary() };
});

export const findGlossaryDuplicatesFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ term_vi: z.string(), ignoreId: ID.optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { findGlossaryDuplicates } = await import("./glossary.service");
    await requireSession("editor");
    return { warnings: await findGlossaryDuplicates(data.term_vi, data.ignoreId) };
  });

// ───────────────────────────── writes ─────────────────────────────

export const createGlossaryTermFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object(TERM_FIELDS).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { createGlossaryTerm } = await import("./glossary.service");
    const user = await requireSession("editor");
    const row = await createGlossaryTerm(user.id, {
      ...data,
      notes: data.notes ?? null,
    });
    await bumpCmsRev();
    return { row };
  });

export const updateGlossaryTermFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        id: ID,
        term_vi: TERM_FIELDS.term_vi.optional(),
        term_en: TERM_FIELDS.term_en.optional(),
        term_zh: TERM_FIELDS.term_zh.optional(),
        category: CATEGORY.optional(),
        notes: TERM_FIELDS.notes,
        priority: TERM_FIELDS.priority,
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { updateGlossaryTerm } = await import("./glossary.service");
    const user = await requireSession("editor");
    const row = await updateGlossaryTerm(user.id, {
      ...data,
      notes: data.notes === undefined ? undefined : (data.notes ?? null),
    });
    await bumpCmsRev();
    return { row };
  });

export const deleteGlossaryTermFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: ID }).parse(input))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const { deleteGlossaryTerm } = await import("./glossary.service");
    const user = await requireSession("editor");
    await deleteGlossaryTerm(user.id, data.id);
    await bumpCmsRev();
    return { ok: true as const };
  });
