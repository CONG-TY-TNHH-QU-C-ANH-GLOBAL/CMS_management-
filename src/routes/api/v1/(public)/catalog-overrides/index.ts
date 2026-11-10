import { createFileRoute } from "@tanstack/react-router";

import { corsJson, corsOptions } from "@/core/middlewares/cors";
import { listCatalogOverrides } from "@/features/catalog";

export const Route = createFileRoute("/api/v1/(public)/catalog-overrides/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request }) => {
        const rows = await listCatalogOverrides();
        return corsJson(request, {
          overrides: rows.map((r) => ({
            product_id: r.product_id,
            template_url: r.template_url,
            price_includes_shipping: r.price_includes_shipping === 1,
          })),
        });
      },
    },
  },
});
