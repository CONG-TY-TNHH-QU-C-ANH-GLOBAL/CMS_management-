import { createFileRoute } from "@tanstack/react-router";

import { corsJson, corsOptions } from "@/core/middlewares/cors";
import { listIntegrations } from "@/features/content";

export const Route = createFileRoute("/api/v1/(public)/integrations/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request }) => {
        const all = await listIntegrations();
        const sorted = all
          .sort((a, b) => a.position - b.position)
          .map((i) => ({
            id: i.id,
            position: i.position,
            name: i.name,
            url: i.url,
            color_class: i.color_class,
            logo_media_id: i.logo_media_id,
          }));
        return corsJson(request, { integrations: sorted });
      },
    },
  },
});
