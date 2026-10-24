import { createFileRoute } from "@tanstack/react-router";

import { corsJson, corsOptions } from "@/core/middlewares/cors";
import {
  availableCampaignLocales,
  getLiveCampaignForPublic,
  resolveCampaignMedia,
  toPublicCampaign,
  vnToday,
  type CampaignLocale,
} from "@/features/campaigns";

const locales = new Set<string>(["en", "vi", "zh"]);

export const Route = createFileRoute("/api/v1/(public)/campaigns/$slug")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const lang = url.searchParams.get("lang") ?? "vi";
        if (!locales.has(lang)) return corsJson(request, { error: "Invalid lang" }, { status: 400 });

        const row = await getLiveCampaignForPublic(params.slug, lang as CampaignLocale);
        if (!row) return corsJson(request, { error: "Not found" }, { status: 404 });

        const [media, available_locales] = await Promise.all([
          resolveCampaignMedia([row], url.origin),
          availableCampaignLocales(row.id),
        ]);
        const { list, detail } = toPublicCampaign(row, media, vnToday());
        return corsJson(request, { campaign: { ...list, ...detail }, available_locales });
      },
    },
  },
});
