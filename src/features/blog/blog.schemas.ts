// Public response schemas for /api/v1 endpoints under the blog feature.
//
// HEIGHTENED-WATCH FILE — this is the surface that incident 11e9230
// regressed via the unrelated-history merge. `blog_slides[].alt_text` must
// stay `z.string()` (non-nullable) here to stay aligned with:
//
//   - DB constraint:  blog_slides.alt_text TEXT NOT NULL
//                     (db/migrations/0001_init.sql, line 263)
//   - Service type:   BlogSlideRow.alt_text: string
//                     (src/features/blog/blog.service.ts, line 34)
//   - Editor input:   alt_text z.string().max(200)
//                     (src/features/blog/blog.actions.ts, line 64; allows
//                     "" but never null because of NOT NULL constraint)
//   - Landing Zod:    blogPostSlideSchema.alt_text: z.string()
//                     (THG_landingpage/src/lib/cmsSchemas.ts, line 299)
//
// If anyone proposes `alt_text: z.string().nullable()` here, the failure
// mode is silent contract drift across the 4 layers above. The drift
// check script and the inline guard at src/openapi/registry.ts are the
// structural safeguards; this file's comment is the human-readable
// reminder.

import { z } from "zod";

const localeSchema = z.enum(["en", "vi", "zh"]);

// Summary projection used by GET /api/v1/blog?lang=&category=
// (blog/index.ts:22-30). Slug/title required; remaining fields nullable
// per BlogPostRow source type (blog.service.ts:10-27). NO slides here —
// list responses do not embed slides; that's only on the detail endpoint.
const blogPostSummarySchema = z.object({
  slug: z.string(),
  title: z.string(),
  excerpt: z.string().nullable(),
  thumbnail_url: z.string().nullable(),
  category: z.string().nullable(),
  published_date: z.string().nullable(),
  updated_at: z.number().int(),
});

// /api/v1/blog?lang=&category= response body.
// Built in blog/index.ts:20 as `{ locale, posts, total }`.
export const blogListResponseSchema = z.object({
  locale: localeSchema,
  posts: z.array(blogPostSummarySchema),
  total: z.number().int(),
});

export type BlogListResponse = z.infer<typeof blogListResponseSchema>;

// ──── HEIGHTENED-WATCH FIELD ────
// `alt_text: z.string()` (non-null). Do not change to .nullable().
// See incident 11e9230 lineage at the top of this file.
const blogPostSlideSchema = z.object({
  src: z.string(),
  alt_text: z.string(),
});

// Detail projection used by GET /api/v1/blog/$slug?lang=
// (blog/$slug.ts:25-37). Adds seo_title / seo_description over the summary
// and embeds slides[] from getBlogSlides().
const blogPostDetailSchema = z.object({
  slug: z.string(),
  title: z.string(),
  excerpt: z.string().nullable(),
  thumbnail_url: z.string().nullable(),
  category: z.string().nullable(),
  published_date: z.string().nullable(),
  seo_title: z.string().nullable(),
  seo_description: z.string().nullable(),
  body_md: z.string().nullable(),
  updated_at: z.number().int(),
  slides: z.array(blogPostSlideSchema),
});

// /api/v1/blog/$slug?lang= response body.
// Built in blog/$slug.ts:23 as `{ locale, post: { ...projection } }`.
export const blogPostResponseSchema = z.object({
  locale: localeSchema,
  post: blogPostDetailSchema,
});

export type BlogPostResponse = z.infer<typeof blogPostResponseSchema>;
