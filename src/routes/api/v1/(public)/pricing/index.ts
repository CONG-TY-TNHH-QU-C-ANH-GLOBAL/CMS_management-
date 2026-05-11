import { createFileRoute } from "@tanstack/react-router";

import { corsJson, corsOptions } from "@/core/middlewares/cors";
import { listPricingTables } from "@/features/pricing";

export const Route = createFileRoute("/api/v1/(public)/pricing/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request }) => {
        const categories = await listPricingTables();
        return corsJson(request, { categories });
      },
    },
  },
});
