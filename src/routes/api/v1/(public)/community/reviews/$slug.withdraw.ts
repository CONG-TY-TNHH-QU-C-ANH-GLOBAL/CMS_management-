import { createFileRoute } from "@tanstack/react-router";

import { corsOptions } from "@/core/middlewares/cors";
import { handleCommunityWithdraw } from "@/features/community/community.http";
import { withdrawCommunityReview } from "@/features/community";

export const Route = createFileRoute("/api/v1/(public)/community/reviews/$slug/withdraw")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      POST: ({ request, params }) =>
        handleCommunityWithdraw(
          request,
          params.slug,
          "community-review-withdraw",
          withdrawCommunityReview,
          "Không thể rút đánh giá này.",
        ),
    },
  },
});
