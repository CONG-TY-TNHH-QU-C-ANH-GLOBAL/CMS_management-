import { createFileRoute } from "@tanstack/react-router";

import { corsJson, corsOptions } from "@/core/middlewares/cors";
import {
  getCatalogSettings,
  listCatalogOverrides,
  resolvePriceIncludesShipping,
} from "@/features/catalog";

export const Route = createFileRoute("/api/v1/(public)/catalog-overrides/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request }) => {
        const [rows, settings] = await Promise.all([listCatalogOverrides(), getCatalogSettings()]);
        const catalogDefault = settings.price_includes_shipping_default;
        return corsJson(request, {
          price_includes_shipping_default: catalogDefault,
          overrides: rows.map((r) => ({
            product_id: r.product_id,
            template_url: r.template_url,
            // Resolved, so a landing that predates the default still reads a boolean.
            price_includes_shipping: resolvePriceIncludesShipping(
              r.price_includes_shipping,
              catalogDefault,
            ),
          })),
        });
      },
    },
  },
});
