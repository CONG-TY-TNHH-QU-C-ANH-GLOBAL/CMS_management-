import { createFileRoute } from "@tanstack/react-router";

import { corsError, corsJson, corsOptions } from "@/core/middlewares/cors";
import { getPublishedCommunityReview, toPublicReviewDetail } from "@/features/community";

export const Route = createFileRoute("/api/v1/(public)/community/reviews/$slug")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request, params }) => {
        const r = await getPublishedCommunityReview(params.slug);
        if (!r) {
          return corsError(request, 404, `No published review with slug "${params.slug}"`);
        }
        // Privacy boundary lives in community.mappers.ts — reviewer_email / ip /
        // user_agent / utm_json / private evidence never leave the admin surface.
        return corsJson(request, { review: toPublicReviewDetail(r) });
      },
    },
  },
});
