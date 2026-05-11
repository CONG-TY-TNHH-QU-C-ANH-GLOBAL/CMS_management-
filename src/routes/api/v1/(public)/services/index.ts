import { createFileRoute } from "@tanstack/react-router";

import { corsError, corsJson, corsOptions } from "@/core/middlewares/cors";
import { listServices, type ServiceGalleryItem, type ServiceProduct } from "@/features/content";
import { listMediaByIds } from "@/features/media";
import { isLocale, type Locale } from "@/features/i18n";

/** Convert `{media_id}` references inside gallery/products to resolved URLs. */
async function hydrateMediaIds<T extends { media_id?: number; url?: string; image?: string }>(
  items: T[],
  field: "url" | "image",
): Promise<T[]> {
  const ids = items.map((i) => i.media_id).filter((x): x is number => typeof x === "number");
  if (ids.length === 0) return items;
  const rows = await listMediaByIds(ids);
  const urlById = new Map(rows.map((r) => [r.id, r.url ?? ""]));
  return items.map((i) => {
    if (i.media_id && !i[field]) {
      const u = urlById.get(i.media_id);
      if (u) return { ...i, [field]: u };
    }
    return i;
  });
}

export const Route = createFileRoute("/api/v1/(public)/services/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const lang = url.searchParams.get("lang") ?? "en";
        if (!isLocale(lang)) {
          return corsError(request, 400, "Invalid `lang` (en|vi|zh)");
        }

        const services = await listServices();
        const flat = await Promise.all(
          services
            .filter((s) => s.status !== "archived")
            .map(async (s) => {
              const i18n = s.i18n[lang as Locale];
              const [gallery, products] = await Promise.all([
                hydrateMediaIds<ServiceGalleryItem>(s.gallery, "url"),
                hydrateMediaIds<ServiceProduct>(s.products, "image"),
              ]);
              return {
                id: s.id,
                position: s.position,
                icon: s.icon,
                status: s.status,
                name: i18n?.name ?? s.id,
                tagline: i18n?.tagline ?? null,
                hero_eyebrow: i18n?.hero_eyebrow ?? null,
                hero_title: i18n?.hero_title ?? null,
                hero_sub: i18n?.hero_sub ?? null,
                cta_text: i18n?.cta_text ?? null,
                cta_url: i18n?.cta_url ?? null,
                body_md: i18n?.body_md ?? null,
                bullets: s.bullets[lang as Locale] ?? [],
                gallery,
                videos: s.videos,
                products,
              };
            }),
        );
        return corsJson(request, { locale: lang, services: flat });
      },
    },
  },
});
