import { createFileRoute } from "@tanstack/react-router";

import { corsJson, corsOptions } from "@/core/middlewares/cors";
import {
  listLiveCampaignsForPublic,
  resolveCampaignMedia,
  toPublicCampaign,
  vnToday,
  type CampaignLocale,
} from "@/features/campaigns";

const locales = new Set<string>(["en", "vi", "zh"]);

export const Route = createFileRoute("/api/v1/(public)/campaigns/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const lang = url.searchParams.get("lang") ?? "vi";
        if (!locales.has(lang))
          return corsJson(request, { error: "Invalid lang" }, { status: 400 });

        // Live only, ordered by position then start_date DESC; en/zh read a
        // reviewed translation and fall back to VI.
        const rows = await listLiveCampaignsForPublic(lang as CampaignLocale);
        const media = await resolveCampaignMedia(rows, url.origin);
        const today = vnToday();
        return corsJson(request, {
          locale: lang,
          campaigns: rows.map((row) => toPublicCampaign(row, media, today).list),
        });
      },
    },
  },
});
