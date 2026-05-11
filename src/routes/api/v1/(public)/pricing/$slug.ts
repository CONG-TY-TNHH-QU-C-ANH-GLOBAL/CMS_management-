import { createFileRoute } from "@tanstack/react-router";

import { corsError, corsJson, corsOptions } from "@/core/middlewares/cors";
import { getPricingTable } from "@/features/pricing";

export const Route = createFileRoute("/api/v1/(public)/pricing/$slug")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request, params }) => {
        const table = await getPricingTable(params.slug);
        if (!table) return corsError(request, 404, `No pricing table with slug "${params.slug}"`);

        // Parse JSON blobs server-side so client doesn't need to. Each field
        // is parsed independently — if one is malformed, the other still
        // surfaces so the editor can at least render the valid half.
        let schema: unknown = null;
        let data: unknown = null;
        try { schema = JSON.parse(table.schema_json); } catch { /* schema malformed */ }
        try { data = JSON.parse(table.data_json); } catch { /* data malformed */ }
        return corsJson(request, {
          table: {
            id: table.id,
            slug: table.slug,
            name: table.name,
            kind: table.kind,
            description: table.description,
            schema,
            data,
            version: table.version,
            status: table.status,
            updated_at: table.updated_at,
          },
        });
      },
    },
  },
});
