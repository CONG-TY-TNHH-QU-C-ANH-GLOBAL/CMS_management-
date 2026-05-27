import { createFileRoute } from "@tanstack/react-router";

import { corsError, corsJson, corsOptions } from "@/core/middlewares/cors";
import { isLocale } from "@/features/i18n";
import { getShippingRouteForPublic, getShippingTables } from "@/features/shipping";

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export const Route = createFileRoute("/api/v1/(public)/shipping-routes/$slug")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const lang = url.searchParams.get("lang") ?? "en";
        if (!isLocale(lang)) return corsError(request, 400, "Invalid `lang` (en|vi|zh)");

        const route = await getShippingRouteForPublic(params.slug, lang);
        if (!route || route.status !== "live") {
          return corsError(request, 404, `No live shipping route "${params.slug}" in locale "${lang}"`);
        }
        const tables = await getShippingTables(route.id);

        return corsJson(request, {
          locale: lang,
          route: {
            slug: route.slug,
            position: route.position,
            title: route.title,
            origin: route.origin,
            destination: route.destination,
            kind: route.kind,
            body_md: route.body_md,
            notes: parseJson<string[]>(route.notes_json) ?? [],
            tables: tables.map((t) => ({
              caption: t.caption,
              columns: parseJson<Array<{ key: string; label: string }>>(t.columns_json) ?? [],
              rows: parseJson<Array<Record<string, string | number | null>>>(t.rows_json) ?? [],
            })),
            updated_at: route.updated_at,
          },
        });
      },
    },
  },
});
