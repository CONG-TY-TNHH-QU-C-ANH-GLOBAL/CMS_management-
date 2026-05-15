import { createFileRoute } from "@tanstack/react-router";

import { corsError, corsJson, corsOptions } from "@/core/middlewares/cors";
import { listFaqsForLocale } from "@/features/content";
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
        // VI reads from `faqs`; EN/ZH JOINs `faq_translations` filtered by
        // status='reviewed' per spec §7.1. No cross-locale fallback (§7.2) —
        // unreviewed rows simply omit; landing's static i18n.tsx covers the gap.
        const faqs = await listFaqsForLocale(scope, lang);
        return corsJson(request, { locale: lang, scope, faqs });
      },
    },
  },
});
