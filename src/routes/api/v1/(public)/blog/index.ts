import { createFileRoute } from "@tanstack/react-router";

import { corsError, corsJson, corsOptions } from "@/core/middlewares/cors";
import { listBlogPosts } from "@/features/blog";
import { isLocale } from "@/features/i18n";

export const Route = createFileRoute("/api/v1/(public)/blog/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const lang = url.searchParams.get("lang") ?? "en";
        const category = url.searchParams.get("category") ?? undefined;
        if (!isLocale(lang)) return corsError(request, 400, "Invalid `lang` (en|vi|zh)");

        const all = await listBlogPosts({ locale: lang, status: "live" });
        const filtered = category ? all.filter((p) => p.category === category) : all;

        return corsJson(request, {
          locale: lang,
          posts: filtered.map((p) => ({
            slug: p.slug,
            title: p.title,
            excerpt: p.excerpt,
            thumbnail_url: p.thumbnail_url,
            category: p.category,
            published_date: p.published_date,
            updated_at: p.updated_at,
          })),
          total: filtered.length,
        });
      },
    },
  },
});
