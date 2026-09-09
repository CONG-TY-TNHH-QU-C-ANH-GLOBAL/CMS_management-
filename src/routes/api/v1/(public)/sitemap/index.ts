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
  id: number;
  slug: string;
  locale: string;
  published_date: string | null;
  updated_at: number;
  status: string;
}

interface BlogTranslationRow {
  slug: string;
  locale: "en" | "zh";
}

export const Route = createFileRoute("/api/v1/(public)/sitemap/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request }) => {
        const db = getDb();
        const [pagesRes, blogRes, blogTranslationsRes] = await Promise.all([
          db
            .prepare(
              `SELECT route, locale, updated_at, status FROM pages
               WHERE status = 'live' AND indexable = 1`,
            )
            .all<PageRow>(),
          db
            .prepare(
              `SELECT id, slug, locale, published_date, updated_at, status
               FROM blog_posts WHERE status = 'live'`,
            )
            .all<BlogRow>(),
          db
            .prepare(
              `SELECT p.slug, t.locale
               FROM blog_posts p
               JOIN blog_post_translations t ON t.blog_post_id = p.id
               WHERE p.status = 'live' AND p.locale = 'vi' AND t.status = 'reviewed'`,
            )
            .all<BlogTranslationRow>(),
        ]);
        const translationsBySlug = new Map<string, Set<string>>();
        for (const row of blogTranslationsRes.results ?? []) {
          const locales = translationsBySlug.get(row.slug) ?? new Set<string>();
          locales.add(row.locale);
          translationsBySlug.set(row.slug, locales);
        }
        const blogBySlug = new Map<string, BlogRow & { available_locales: Set<string> }>();
        for (const row of blogRes.results ?? []) {
          const current = blogBySlug.get(row.slug);
          if (current) {
            current.available_locales.add(row.locale);
            if (row.updated_at > current.updated_at) current.updated_at = row.updated_at;
            continue;
          }
          blogBySlug.set(row.slug, { ...row, available_locales: new Set([row.locale]) });
        }
        for (const [slug, locales] of translationsBySlug) {
          const item = blogBySlug.get(slug);
          if (item) for (const locale of locales) item.available_locales.add(locale);
        }
        return corsJson(request, {
          pages: (pagesRes.results ?? []).map((p) => ({
            route: p.route,
            locale: p.locale,
            updated_at: p.updated_at,
          })),
          blog: [...blogBySlug.values()].map((b) => ({
            slug: b.slug,
            locale: b.locale,
            available_locales: [...b.available_locales],
            published_date: b.published_date,
            updated_at: b.updated_at,
          })),
        });
      },
    },
  },
});
