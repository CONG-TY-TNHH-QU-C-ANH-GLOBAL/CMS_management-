import { createFileRoute } from "@tanstack/react-router";

import { corsJson, corsOptions } from "@/core/middlewares/cors";
import { listLivePartners, toMediaUrl } from "@/features/partners";
import { getDb } from "@/core/db/client";

export const Route = createFileRoute("/api/v1/(public)/partners/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request }) => {
        const partners = await listLivePartners();
        const ids = partners
          .map((p) => p.logo_media_id)
          .filter((id): id is number => typeof id === "number");

        // One lookup for the whole list rather than a JOIN per row. The strip is
        // a handful of logos; the placeholder list is built from the ids we
        // actually have so an empty list never produces `IN ()`.
        const keyById = new Map<number, string>();
        if (ids.length > 0) {
          const placeholders = ids.map(() => "?").join(", ");
          const rows = await getDb()
            .prepare(`SELECT id, r2_key FROM media WHERE id IN (${placeholders})`)
            .bind(...ids)
            .all<{ id: number; r2_key: string }>();
          for (const row of rows.results ?? []) keyById.set(row.id, row.r2_key);
        }

        const origin = new URL(request.url).origin;
        return corsJson(request, {
          partners: partners.map((p) => ({
            id: p.id,
            position: p.position,
            name: p.name,
            logo_url: toMediaUrl(
              p.logo_media_id ? (keyById.get(p.logo_media_id) ?? null) : null,
              origin,
            ),
            url: p.url,
            tier: p.tier,
          })),
        });
      },
    },
  },
});
