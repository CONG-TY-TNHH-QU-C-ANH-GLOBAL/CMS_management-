import { createFileRoute } from "@tanstack/react-router";

import { corsJson, corsOptions } from "@/core/middlewares/cors";
import { listLiveLeadership } from "@/features/leadership";
import { toMediaUrl } from "@/features/partners/partners.media";

export const Route = createFileRoute("/api/v1/(public)/leadership/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const rows = await listLiveLeadership();
        return corsJson(request, {
          leadership: rows.map((row) => ({
            id: row.id,
            position: row.position,
            name: row.name,
            role: row.role,
            quote: row.quote,
            avatars: row.avatars.map((avatar) => ({
              url: toMediaUrl(avatar.r2_key, origin)!,
              alt: avatar.alt_text || row.name,
            })),
          })),
        });
      },
    },
  },
});
