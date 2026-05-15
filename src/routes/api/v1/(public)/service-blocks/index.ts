import { createFileRoute } from "@tanstack/react-router";

import { corsError, corsJson, corsOptions } from "@/core/middlewares/cors";
import { listServiceBlocksForLocale } from "@/features/content";
import { isLocale } from "@/features/i18n";

/**
 * GET /api/v1/service-blocks?page_slug=thg-order&kind=pain_point&lang=vi
 *
 * Returns the generic-card blocks (pain_points, process_steps, solutions,
 * shipping_lanes, policies, stats, …) for one page + locale, optionally
 * filtered to a single kind. `kind` is omittable so a single fetch can
 * hydrate every section on a page when needed.
 *
 * Response shape:
 *   { locale, page_slug, kind?, blocks: [{ id, kind, position, icon, title,
 *     description, payload: Record<string, unknown> }] }
 *
 * `payload` is parsed server-side from `payload_json` so the client never
 * has to do JSON.parse on a string.
 */
export const Route = createFileRoute("/api/v1/(public)/service-blocks/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const lang = url.searchParams.get("lang") ?? "en";
        const pageSlug = url.searchParams.get("page_slug")?.trim();
        const kind = url.searchParams.get("kind")?.trim() || undefined;

        if (!isLocale(lang)) {
          return corsError(request, 400, "Invalid `lang` (en|vi|zh)");
        }
        if (!pageSlug) {
          return corsError(request, 400, "Missing required `page_slug`");
        }

        // VI reads from service_blocks; EN/ZH JOINs service_block_translations
        // filtered by status='reviewed' per spec §7.1 + Rule 8.
        const rows = await listServiceBlocksForLocale({ page_slug: pageSlug, lang, kind });

        const blocks = rows.map((r) => {
          let payload: Record<string, unknown> = {};
          try {
            const parsed = JSON.parse(r.payload_json || "{}");
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              payload = parsed as Record<string, unknown>;
            }
          } catch {
            // Bad JSON on a single row shouldn't 500 the entire response —
            // surface an empty payload and rely on the client's Zod schema
            // to either tolerate or refuse it.
          }
          return {
            id: r.id,
            kind: r.kind,
            position: r.position,
            icon: r.icon,
            title: r.title,
            description: r.description,
            payload,
          };
        });

        return corsJson(request, {
          locale: lang,
          page_slug: pageSlug,
          kind: kind ?? null,
          blocks,
        });
      },
    },
  },
});
