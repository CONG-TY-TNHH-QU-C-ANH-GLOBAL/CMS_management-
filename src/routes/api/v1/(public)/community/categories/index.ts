import { createFileRoute } from "@tanstack/react-router";

import { corsJson, corsOptions } from "@/core/middlewares/cors";
import { listCommunityCategories } from "@/features/community";

export const Route = createFileRoute("/api/v1/(public)/community/categories/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request }) => {
        const categories = await listCommunityCategories();
        return corsJson(request, {
          categories: categories.map((c) => ({ slug: c.slug, name: c.name, position: c.position })),
        });
      },
    },
  },
});
