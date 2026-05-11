import { createFileRoute } from "@tanstack/react-router";

import { corsError, corsJson, corsOptions } from "@/core/middlewares/cors";
import { isLocale, getTranslations } from "@/features/i18n";

export const Route = createFileRoute("/api/v1/(public)/translations/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const lang = url.searchParams.get("lang");
        if (!lang || !isLocale(lang)) {
          return corsError(request, 400, "Missing or invalid `lang` query (en|vi|zh)");
        }
        const translations = await getTranslations(lang);
        return corsJson(request, { locale: lang, translations });
      },
    },
  },
});
