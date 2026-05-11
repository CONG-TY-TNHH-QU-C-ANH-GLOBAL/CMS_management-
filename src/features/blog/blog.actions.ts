import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type { BlogLocale, BlogPostRow, BlogSlideRow, BlogStatus } from "@/features/blog";

const LOCALE = z.enum(["en", "vi", "zh"]);
const STATUS = z.enum(["draft", "review", "live", "archived"]);

// ─────────────── reads ───────────────

export const listBlogPostsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { listBlogPostsGrouped } = await import("@/features/blog");
  await requireSession("viewer");
  return { groups: await listBlogPostsGrouped() };
});

export const getBlogPostDetailFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ slug: z.string().min(1), locale: LOCALE }).parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { getBlogPost, getBlogSlides } = await import("@/features/blog");
    await requireSession("viewer");
    const post = await getBlogPost(data.slug, data.locale);
    if (!post) return { post: null, slides: [] };
    const slides = await getBlogSlides(post.id);
    return { post, slides };
  });

// ─────────────── mutations ───────────────

const upsertSchema = z.object({
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/, "slug chỉ gồm chữ thường, số, dấu gạch ngang"),
  locale: LOCALE,
  title: z.string().min(1).max(500),
  excerpt: z.string().max(2000).nullable().optional(),
  thumbnail_media_id: z.number().int().positive().nullable().optional(),
  category: z.string().max(100).nullable().optional(),
  published_date: z.string().max(20).nullable().optional(),
  status: STATUS.optional(),
  seo_title: z.string().max(200).nullable().optional(),
  seo_description: z.string().max(500).nullable().optional(),
  og_image_id: z.number().int().positive().nullable().optional(),
});

export const upsertBlogPostFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => upsertSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { upsertBlogPost } = await import("@/features/blog");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    const post = await upsertBlogPost(me.id, data);
    await bumpCmsRev();
    return { post };
  });

export const setBlogThumbnailFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({
      slug: z.string().min(1),
      locale: LOCALE,
      url: z.string().url().max(2000),
      alt_text: z.string().max(200).default(""),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { setBlogThumbnailFromUrl } = await import("@/features/blog");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    const post = await setBlogThumbnailFromUrl(me.id, data);
    await bumpCmsRev();
    return { post };
  });

const slidesSchema = z.object({
  slug: z.string().min(1),
  locale: LOCALE,
  slides: z.array(
    z.object({ url: z.string().url().max(2000), alt_text: z.string().max(200) }),
  ).max(100),
});

export const replaceBlogSlidesFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => slidesSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { replaceBlogSlides } = await import("@/features/blog");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    const slides = await replaceBlogSlides(me.id, data);
    await bumpCmsRev();
    return { slides };
  });

export const deleteBlogPostFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ slug: z.string().min(1), locale: LOCALE }).parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { deleteBlogPost } = await import("@/features/blog");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    await deleteBlogPost(me.id, data.slug, data.locale);
    await bumpCmsRev();
    return { ok: true as const };
  });

export const deleteBlogSlugFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ slug: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { deleteBlogSlug } = await import("@/features/blog");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    await deleteBlogSlug(me.id, data.slug);
    await bumpCmsRev();
    return { ok: true as const };
  });
