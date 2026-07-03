import { createFileRoute } from "@tanstack/react-router";

import { corsOptions } from "@/core/middlewares/cors";
import { handleCommunityDetail } from "@/features/community/community.http";
import { getPublishedCommunityReview, toPublicReviewDetail } from "@/features/community";

export const Route = createFileRoute("/api/v1/(public)/community/reviews/$slug")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      // Privacy boundary lives in community.mappers.ts — reviewer_email / ip /
      // user_agent / utm_json / private evidence never leave the admin surface.
      GET: ({ request, params }) =>
        handleCommunityDetail(
          request,
          params.slug,
          getPublishedCommunityReview,
          toPublicReviewDetail,
          "review",
          `No published review with slug "${params.slug}"`,
        ),
    },
  },
});
