import { createFileRoute } from "@tanstack/react-router";

import { corsJson, corsOptions } from "@/core/middlewares/cors";
import { getDb } from "@/core/db/client";

interface PageRow {
  route: string;
  locale: string;
  updated_at: number;
  status: string;
}

interface BlogRow {
  slug: string;
  locale: string;
  published_date: string | null;
  updated_at: number;
  status: string;
}

export const Route = createFileRoute("/api/v1/(public)/sitemap/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request }) => {
        const db = getDb();
        const [pagesRes, blogRes] = await Promise.all([
          db
            .prepare(
              `SELECT route, locale, updated_at, status FROM pages WHERE status = 'live'`,
            )
            .all<PageRow>(),
          db
            .prepare(
              `SELECT slug, locale, published_date, updated_at, status FROM blog_posts WHERE status = 'live'`,
            )
            .all<BlogRow>(),
        ]);
        return corsJson(request, {
          pages: (pagesRes.results ?? []).map((p) => ({
            route: p.route,
            locale: p.locale,
            updated_at: p.updated_at,
          })),
          blog: (blogRes.results ?? []).map((b) => ({
            slug: b.slug,
            locale: b.locale,
            published_date: b.published_date,
            updated_at: b.updated_at,
          })),
        });
      },
    },
  },
});
