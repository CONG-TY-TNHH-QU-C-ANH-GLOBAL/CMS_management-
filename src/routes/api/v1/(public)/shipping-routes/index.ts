import { createFileRoute } from "@tanstack/react-router";

import { corsError, corsJson, corsOptions } from "@/core/middlewares/cors";
import { isLocale } from "@/features/i18n";
import { listShippingRoutesForPublic } from "@/features/shipping";

export const Route = createFileRoute("/api/v1/(public)/shipping-routes/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const lang = url.searchParams.get("lang") ?? "en";
        if (!isLocale(lang)) return corsError(request, 400, "Invalid `lang` (en|vi|zh)");

        const routes = await listShippingRoutesForPublic({ locale: lang, status: "live" });
        return corsJson(request, {
          locale: lang,
          routes: routes.map((r) => ({
            slug: r.slug,
            position: r.position,
            title: r.title,
            origin: r.origin,
            destination: r.destination,
            kind: r.kind,
          })),
          total: routes.length,
        });
      },
    },
  },
});
