import { createFileRoute } from "@tanstack/react-router";

import { corsError, corsJson, corsOptions } from "@/core/middlewares/cors";
import { listTestimonialsForLocale } from "@/features/content";
import { isLocale } from "@/features/i18n";

export const Route = createFileRoute("/api/v1/(public)/testimonials/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const lang = url.searchParams.get("lang") ?? "en";
        if (!isLocale(lang)) return corsError(request, 400, "Invalid `lang`");
        // VI reads from testimonials; EN/ZH JOINs testimonial_translations
        // filtered by status='reviewed' per spec §7.1 + Rule 8.
        const rows = await listTestimonialsForLocale(lang);
        const testimonials = rows.map((t) => ({
          id: t.id,
          position: t.position,
          quote: t.quote,
          author_name: t.author_name,
          author_role: t.author_role,
          avatar_media_id: t.avatar_media_id,
        }));
        return corsJson(request, { locale: lang, testimonials });
      },
    },
  },
});
