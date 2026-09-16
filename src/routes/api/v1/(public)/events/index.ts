import { createFileRoute } from "@tanstack/react-router";
import { corsJson, corsOptions } from "@/core/middlewares/cors";
import { listLiveEventsForPublic, type EventLocale } from "@/features/events";
import { toMediaUrl } from "@/features/partners/partners.media";
import { getDb } from "@/core/db/client";

const locales = new Set<EventLocale>(["en", "vi", "zh"]);

/** Resolve a batch of media ids to URLs in one query.
 *
 *  Cover and OG image are looked up together rather than per field: the list can
 *  hold a dozen events, and a per-event round trip was already the reason
 *  /api/v1/integrations shipped logos as bare ids. */
async function mediaUrls(ids: number[], origin: string): Promise<Map<number, string>> {
  const unique = [...new Set(ids)];
  const out = new Map<number, string>();
  if (unique.length === 0) return out;
  const rows = await getDb()
    .prepare(`SELECT id, r2_key FROM media WHERE id IN (${unique.map(() => "?").join(",")})`)
    .bind(...unique)
    .all<{ id: number; r2_key: string }>();
  for (const row of rows.results ?? []) {
    const url = toMediaUrl(row.r2_key, origin);
    if (url) out.set(row.id, url);
  }
  return out;
}

export const Route = createFileRoute("/api/v1/(public)/events/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request }) => {
        const lang = new URL(request.url).searchParams.get("lang") ?? "vi";
        if (!locales.has(lang as EventLocale))
          return corsJson(request, { error: "Invalid lang" }, { status: 400 });

        // Reads through reviewed translations for en/zh, falling back to a
        // hand-written per-locale row. See listLiveEventsForPublic.
        const events = await listLiveEventsForPublic(lang as EventLocale);
        const origin = new URL(request.url).origin;
        const media = await mediaUrls(
          events.flatMap((event) =>
            [event.cover_media_id, event.og_image_id].filter((id): id is number => id !== null),
          ),
          origin,
        );

        return corsJson(request, {
          locale: lang,
          events: events.map(({ cover_media_id, og_image_id, ...event }) => ({
            ...event,
            cover_url: cover_media_id ? (media.get(cover_media_id) ?? null) : null,
            og_image_url: og_image_id ? (media.get(og_image_id) ?? null) : null,
          })),
        });
      },
    },
  },
});
