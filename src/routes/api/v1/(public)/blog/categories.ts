import { createFileRoute } from "@tanstack/react-router";

import { corsError, corsJson, corsOptions } from "@/core/middlewares/cors";
import { listBlogCategories } from "@/features/blog";
import { isLocale } from "@/features/i18n";

export const Route = createFileRoute("/api/v1/(public)/blog/categories")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const lang = url.searchParams.get("lang") ?? "vi";
        if (!isLocale(lang)) return corsError(request, 400, "Invalid `lang` (en|vi|zh)");

        const categories = await listBlogCategories(lang);
        return corsJson(request, { locale: lang, categories });
      },
    },
  },
});
