import { createFileRoute } from "@tanstack/react-router";

import { corsOptions } from "@/core/middlewares/cors";
import { handleCommunityWithdraw } from "@/features/community/community.http";
import { withdrawCommunityQuestion } from "@/features/community";

export const Route = createFileRoute("/api/v1/(public)/community/questions/$slug/withdraw")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      POST: ({ request, params }) =>
        handleCommunityWithdraw(
          request,
          params.slug,
          "community-withdraw",
          withdrawCommunityQuestion,
          "Không thể rút câu hỏi này.",
        ),
    },
  },
});
