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
    const { getBlogPost, getBlogPostForPublic, getBlogSlides } = await import(
      "@/features/blog"
    );
    const { toMediaUrl } = await import("@/features/partners/partners.media");
    await requireSession("viewer");
    // VI: read source. EN/ZH: read from blog_post_translations via ForPublic
    // (migration 0024 + spec §7.1). Legacy blog_posts.locale='en'/'zh' rows
    // are superseded once the translation row is reviewed.
    const post =
      data.locale === "vi"
        ? await getBlogPost(data.slug, "vi")
        : await getBlogPostForPublic(data.slug, data.locale);
    if (!post) return { post: null, slides: [], thumbnail_preview: null };
    const slides = await getBlogSlides(post.id);
    // Previews resolve against the CMS origin (""), like the event editor: a
    // bare R2 key is only loadable through /api/v1/media.
    return { post, slides, thumbnail_preview: toMediaUrl(post.thumbnail_url, "") };
  });

/** Categories already in use, offered as suggestions so one topic does not
 *  end up under "Báo cáo", "Report" and "Category" at once. */
export const listBlogCategoryOptionsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { listBlogPosts } = await import("@/features/blog");
  await requireSession("viewer");
  const posts = await listBlogPosts({ locale: "vi" });
  const counts = new Map<string, number>();
  for (const p of posts) {
    const c = p.category?.trim();
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);
});

// ─────────────── mutations ───────────────

const upsertSchema = z.object({
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/, "slug chỉ gồm chữ thường, số, dấu gạch ngang"),
  locale: LOCALE,
  title: z.string().min(1).max(500),
  excerpt: z.string().max(2000).nullable().optional(),
  body_md: z.string().max(100000).nullable().optional(),
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

const slideMediaSchema = z.object({
  slug: z.string().min(1),
  locale: LOCALE,
  slides: z
    .array(z.object({ media_id: z.number().int().positive(), alt_text: z.string().max(200) }))
    .max(100),
});

/** The editor's gallery save: ordered media-library ids + alt text. */
export const replaceBlogSlideMediaFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => slideMediaSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { replaceBlogSlideMedia } = await import("@/features/blog");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    const slides = await replaceBlogSlideMedia(me.id, data);
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
