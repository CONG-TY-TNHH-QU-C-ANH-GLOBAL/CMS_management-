import { createFileRoute } from "@tanstack/react-router";

import { corsError, corsJson, corsOptions } from "@/core/middlewares/cors";
import { listFaqs } from "@/features/content";
import { isLocale } from "@/features/i18n";

export const Route = createFileRoute("/api/v1/(public)/faqs/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const lang = url.searchParams.get("lang") ?? "en";
        const scope = url.searchParams.get("scope") ?? "home";
        if (!isLocale(lang)) {
          return corsError(request, 400, "Invalid `lang` (en|vi|zh)");
        }
        const all = await listFaqs(scope);
        const filtered = all
          .filter((f) => f.locale === lang)
          .sort((a, b) => a.position - b.position)
          .map((f) => ({
            id: f.id,
            position: f.position,
            question: f.question,
            answer: f.answer,
          }));
        return corsJson(request, { locale: lang, scope, faqs: filtered });
      },
    },
  },
});
