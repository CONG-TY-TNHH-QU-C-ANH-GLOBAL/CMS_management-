import { createFileRoute } from "@tanstack/react-router";
import { corsJson, corsOptions } from "@/core/middlewares/cors";
import {
  availableEventLocales,
  getLiveEventForPublic,
  listEventPhotos,
  type EventLocale,
} from "@/features/events";
import { getDb } from "@/core/db/client";
import { toMediaUrl } from "@/features/partners/partners.media";

const locales = new Set<EventLocale>(["en", "vi", "zh"]);

export const Route = createFileRoute("/api/v1/(public)/events/$slug")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request, params }) => {
        const origin = new URL(request.url).origin;
        const lang = new URL(request.url).searchParams.get("lang") ?? "vi";
        if (!locales.has(lang as EventLocale))
          return corsJson(request, { error: "Invalid lang" }, { status: 400 });

        const event = await getLiveEventForPublic(params.slug, lang as EventLocale);
        if (!event) return corsJson(request, { error: "Event not found" }, { status: 404 });

        // `photos` is the gallery `event_photos` has held since migration 0043.
        // It had a CMS editor but no public projection, so everything an operator
        // attached stayed invisible — this endpoint is where that ended.
        //
        // Photos hang off the VI row (they are photographs, not copy), so the id
        // used here is the one the resolver returned, which for a translated read
        // IS the vi row's id.
        const [photos, available_locales] = await Promise.all([
          listEventPhotos(event.id),
          availableEventLocales(params.slug),
        ]);

        const ids = [event.cover_media_id, event.og_image_id].filter(
          (id): id is number => id !== null,
        );
        const media = new Map<number, string>();
        if (ids.length) {
          const rows = await getDb()
            .prepare(`SELECT id, r2_key FROM media WHERE id IN (${ids.map(() => "?").join(",")})`)
            .bind(...ids)
            .all<{ id: number; r2_key: string }>();
          for (const row of rows.results ?? []) {
            const url = toMediaUrl(row.r2_key, origin);
            if (url) media.set(row.id, url);
          }
        }

        const { cover_media_id, og_image_id, ...item } = event;
        return corsJson(request, {
          locale: lang,
          available_locales,
          event: {
            ...item,
            cover_url: cover_media_id ? (media.get(cover_media_id) ?? null) : null,
            og_image_url: og_image_id ? (media.get(og_image_id) ?? null) : null,
            photos: photos
              // A photo whose media row was deleted resolves to no URL. Drop it
              // rather than shipping a null src the landing would render as a
              // broken image.
              .map((photo) => ({
                src: toMediaUrl(photo.r2_key, origin),
                caption: photo.caption,
              }))
              .filter((photo): photo is { src: string; caption: string | null } =>
                Boolean(photo.src),
              ),
          },
        });
      },
    },
  },
});
