import { createFileRoute } from "@tanstack/react-router";

import { corsOptions, withMutationOriginBoundary } from "@/core/middlewares/cors";
import { handleCommunityWithdraw } from "@/features/community/community.http";
import { withdrawCommunityReview } from "@/features/community";

export const Route = createFileRoute("/api/v1/(public)/community/reviews/$slug/withdraw")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      POST: withMutationOriginBoundary(
        ({ request, params }: { request: Request; params: { slug: string } }) =>
          handleCommunityWithdraw(
            request,
            params.slug,
            "community-review-withdraw",
            withdrawCommunityReview,
            "Không thể rút đánh giá này.",
          ),
      ),
    },
  },
});
