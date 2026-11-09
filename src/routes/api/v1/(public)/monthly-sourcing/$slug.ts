import { createFileRoute } from "@tanstack/react-router";

import { corsJson, corsOptions } from "@/core/middlewares/cors";
import { getLiveMonthlySourcingForLanding } from "@/features/monthly-sourcing";
import { parseMonthlySourcingSlug } from "@/features/monthly-sourcing/monthly-sourcing.pure";

/** One live month for thgfulfill.com/{lang}/top-nguon-hang/{slug}. Shares the live/ready rules of the
 *  legacy LP host resolver, so a month that was never published (or whose PDF is not ready) is a 404. */
export const Route = createFileRoute("/api/v1/(public)/monthly-sourcing/$slug")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request, params }) => {
        const identity = parseMonthlySourcingSlug(params.slug);
        if (!identity) return corsJson(request, { error: "Not found" }, { status: 404 });

        const origin = new URL(request.url).origin;
        const live = await getLiveMonthlySourcingForLanding(identity.year, identity.month, origin);
        if (!live) return corsJson(request, { error: "Not found" }, { status: 404 });

        return corsJson(request, {
          year: live.year,
          month: live.month,
          slug: params.slug,
          title: live.title,
          pdf_url: live.pdfUrl,
          pages: live.pages,
        });
      },
    },
  },
});
