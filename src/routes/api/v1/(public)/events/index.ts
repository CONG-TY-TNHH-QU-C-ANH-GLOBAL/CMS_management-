import { createFileRoute } from "@tanstack/react-router";
import { corsJson, corsOptions } from "@/core/middlewares/cors";
import { listLiveEvents, type EventLocale } from "@/features/events";
import { toMediaUrl } from "@/features/partners/partners.media";
import { getDb } from "@/core/db/client";

const locales = new Set<EventLocale>(["en", "vi", "zh"]);
export const Route = createFileRoute("/api/v1/(public)/events/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request }) => {
        const lang = new URL(request.url).searchParams.get("lang") ?? "vi";
        if (!locales.has(lang as EventLocale))
          return corsJson(request, { error: "Invalid lang" }, { status: 400 });
        const events = await listLiveEvents(lang as EventLocale);
        const ids = events
          .map((event) => event.cover_media_id)
          .filter((id): id is number => id !== null);
        const media = new Map<number, string>();
        if (ids.length) {
          const rows = await getDb()
            .prepare(`SELECT id, r2_key FROM media WHERE id IN (${ids.map(() => "?").join(",")})`)
            .bind(...ids)
            .all<{ id: number; r2_key: string }>();
          for (const row of rows.results ?? []) media.set(row.id, row.r2_key);
        }
        const origin = new URL(request.url).origin;
        return corsJson(request, {
          locale: lang,
          events: events.map(({ cover_media_id, ...event }) => ({
            ...event,
            cover_url: cover_media_id
              ? toMediaUrl(media.get(cover_media_id) ?? null, origin)
              : null,
          })),
        });
      },
    },
  },
});
