import { createFileRoute } from "@tanstack/react-router";
import { corsJson, corsOptions } from "@/core/middlewares/cors";
import { getLiveEvent, type EventLocale } from "@/features/events";
import { getDb } from "@/core/db/client";
import { toMediaUrl } from "@/features/partners/partners.media";

const locales = new Set<EventLocale>(["en", "vi", "zh"]);
export const Route = createFileRoute("/api/v1/(public)/events/$slug")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request, params }) => {
        const lang = new URL(request.url).searchParams.get("lang") ?? "vi";
        if (!locales.has(lang as EventLocale))
          return corsJson(request, { error: "Invalid lang" }, 400);
        const event = await getLiveEvent(params.slug, lang as EventLocale);
        if (!event) return corsJson(request, { error: "Event not found" }, 404);
        const media = event.cover_media_id
          ? await getDb()
              .prepare("SELECT r2_key FROM media WHERE id = ?")
              .bind(event.cover_media_id)
              .first<{ r2_key: string }>()
          : null;
        const { cover_media_id, ...item } = event;
        return corsJson(request, {
          event: {
            ...item,
            cover_url: toMediaUrl(media?.r2_key ?? null, new URL(request.url).origin),
          },
        });
      },
    },
  },
});
