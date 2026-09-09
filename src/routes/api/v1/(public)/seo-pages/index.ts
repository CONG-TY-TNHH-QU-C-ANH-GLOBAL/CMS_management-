import { createFileRoute } from "@tanstack/react-router";

import { getDb } from "@/core/db/client";
import { corsJson, corsOptions } from "@/core/middlewares/cors";

interface SeoPageRow {
  route: string;
  locale: "vi" | "en" | "zh";
  title: string;
  meta_description: string | null;
  og_image_url: string | null;
  indexable: number;
  updated_at: number;
}

export const Route = createFileRoute("/api/v1/(public)/seo-pages/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request }) => {
        const result = await getDb()
          .prepare(
            `SELECT p.route, p.locale, p.title, p.meta_description,
                    COALESCE(p.og_image_url, m.url, NULL) AS og_image_url,
                    p.indexable, p.updated_at
             FROM pages p
             LEFT JOIN media m ON m.id = p.og_image_id
             WHERE p.status = 'live'
             ORDER BY p.route, p.locale`,
          )
          .all<SeoPageRow>();

        return corsJson(request, {
          pages: (result.results ?? []).map((page) => ({
            ...page,
            indexable: page.indexable === 1,
          })),
        });
      },
    },
  },
});
