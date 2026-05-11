import { createFileRoute } from "@tanstack/react-router";

import { corsError, corsJson, corsOptions } from "@/core/middlewares/cors";
import { isLocale } from "@/features/i18n";
import { listPolicies } from "@/features/policies";

export const Route = createFileRoute("/api/v1/(public)/policies/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const lang = url.searchParams.get("lang") ?? "en";
        if (!isLocale(lang)) return corsError(request, 400, "Invalid `lang` (en|vi|zh)");

        const policies = await listPolicies({ locale: lang });
        return corsJson(request, {
          locale: lang,
          policies: policies.map((p) => ({
            slug: p.slug,
            title: p.title,
            icon: p.icon,
            mode: p.mode,
            summary: p.summary,
            position: p.position,
          })),
        });
      },
    },
  },
});
