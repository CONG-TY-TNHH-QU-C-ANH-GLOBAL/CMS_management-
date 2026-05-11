import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type { PolicyLocale, PolicyMode, PolicyRow, PolicyTextBlock } from "@/features/policies";

const LOCALE = z.enum(["en", "vi", "zh"]);

export const listPoliciesFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { listPoliciesGrouped } = await import("@/features/policies");
  await requireSession("viewer");
  return { groups: await listPoliciesGrouped() };
});

export const getPolicyDetailFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ slug: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { getPolicy } = await import("@/features/policies");
    await requireSession("viewer");
    const [en, vi, zh] = await Promise.all([
      getPolicy(data.slug, "en"),
      getPolicy(data.slug, "vi"),
      getPolicy(data.slug, "zh"),
    ]);
    return { slug: data.slug, variants: { en, vi, zh } };
  });

const textBlockSchema = z.object({
  type: z.enum(["normal", "warn", "info"]),
  heading: z.string().min(1).max(500),
  content: z.array(z.string().max(2000)).max(100),
});

const upsertSchema = z.object({
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  locale: LOCALE,
  title: z.string().min(1).max(500),
  body_md: z.string().max(50000).optional(),
  icon: z.string().max(50).nullable().optional(),
  mode: z.enum(["image", "text"]).optional(),
  image_list: z.array(z.string().url().max(2000)).max(200).nullable().optional(),
  text_blocks: z.array(textBlockSchema).max(50).nullable().optional(),
  summary: z.string().max(2000).nullable().optional(),
  position: z.number().int().min(0).optional(),
});

export const upsertPolicyFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => upsertSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { upsertPolicy } = await import("@/features/policies");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    const policy = await upsertPolicy(me.id, data);
    await bumpCmsRev();
    return { policy };
  });

export const deletePolicySlugFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ slug: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { deletePolicySlug } = await import("@/features/policies");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    await deletePolicySlug(me.id, data.slug);
    await bumpCmsRev();
    return { ok: true as const };
  });
