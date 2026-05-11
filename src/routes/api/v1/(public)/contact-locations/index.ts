import { createFileRoute } from "@tanstack/react-router";

import { corsError, corsJson, corsOptions } from "@/core/middlewares/cors";
import { listContactLocations } from "@/features/content";
import { isLocale } from "@/features/i18n";

export const Route = createFileRoute("/api/v1/(public)/contact-locations/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const lang = url.searchParams.get("lang") ?? "en";
        if (!isLocale(lang)) return corsError(request, 400, "Invalid `lang`");
        const all = await listContactLocations();
        const filtered = all
          .filter((c) => c.locale === lang)
          .sort((a, b) => a.position - b.position)
          .map((c) => ({
            id: c.id,
            position: c.position,
            kind: c.kind,
            label: c.label,
            address: c.address,
            phone: c.phone,
            url: c.url,
            lang_class: c.lang_class,
          }));
        return corsJson(request, { locale: lang, locations: filtered });
      },
    },
  },
});
