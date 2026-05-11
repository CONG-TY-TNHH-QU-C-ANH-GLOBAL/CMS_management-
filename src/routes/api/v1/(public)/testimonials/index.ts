import { createFileRoute } from "@tanstack/react-router";

import { corsError, corsJson, corsOptions } from "@/core/middlewares/cors";
import { listTestimonials } from "@/features/content";
import { isLocale } from "@/features/i18n";

export const Route = createFileRoute("/api/v1/(public)/testimonials/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const lang = url.searchParams.get("lang") ?? "en";
        if (!isLocale(lang)) return corsError(request, 400, "Invalid `lang`");
        const all = await listTestimonials();
        const filtered = all
          .filter((t) => t.locale === lang)
          .sort((a, b) => a.position - b.position)
          .map((t) => ({
            id: t.id,
            position: t.position,
            quote: t.quote,
            author_name: t.author_name,
            author_role: t.author_role,
            avatar_media_id: t.avatar_media_id,
          }));
        return corsJson(request, { locale: lang, testimonials: filtered });
      },
    },
  },
});
