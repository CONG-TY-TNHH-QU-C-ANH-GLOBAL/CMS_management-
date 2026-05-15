import { createFileRoute } from "@tanstack/react-router";

import { corsError, corsJson, corsOptions } from "@/core/middlewares/cors";
import { listHomepageBlocksForLocale } from "@/features/homepage";
import { isLocale } from "@/features/i18n";

export const Route = createFileRoute("/api/v1/(public)/homepage/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const lang = url.searchParams.get("lang") ?? "en";
        if (!isLocale(lang)) {
          return corsError(request, 400, "Invalid `lang` (en|vi|zh)");
        }
        // VI reads from homepage_blocks; EN/ZH JOINs homepage_block_translations
        // filtered by status='reviewed' per spec §7.1 + Rule 8.
        const blocks = await listHomepageBlocksForLocale(lang);
        return corsJson(request, { locale: lang, blocks });
      },
    },
  },
});
