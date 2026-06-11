import { createFileRoute } from "@tanstack/react-router";

import { corsError, corsJson, corsOptions } from "@/core/middlewares/cors";
import { getBlogPostForPublic, getBlogSlides } from "@/features/blog";
import { isLocale } from "@/features/i18n";

export const Route = createFileRoute("/api/v1/(public)/blog/$slug")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const lang = url.searchParams.get("lang") ?? "en";
        if (!isLocale(lang)) return corsError(request, 400, "Invalid `lang` (en|vi|zh)");

        const post = await getBlogPostForPublic(params.slug, lang);
        if (!post) return corsError(request, 404, `No blog post with slug "${params.slug}" in locale "${lang}"`);
        if (post.status !== "live") {
          return corsError(request, 404, `Blog post "${params.slug}" not published`);
        }
        const slides = await getBlogSlides(post.id);

        return corsJson(request, {
          locale: lang,
          post: {
            slug: post.slug,
            title: post.title,
            excerpt: post.excerpt,
            body_md: post.body_md,
            thumbnail_url: post.thumbnail_url,
            category: post.category,
            published_date: post.published_date,
            seo_title: post.seo_title,
            seo_description: post.seo_description,
            updated_at: post.updated_at,
            slides: slides.map((s) => ({ src: s.src, alt_text: s.alt_text })),
          },
        });
      },
    },
  },
});
