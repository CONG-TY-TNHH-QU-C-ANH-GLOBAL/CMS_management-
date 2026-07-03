import { createFileRoute } from "@tanstack/react-router";

import { corsOptions } from "@/core/middlewares/cors";
import { handleCommunityDetail } from "@/features/community/community.http";
import { getPublishedCommunityQuestion, toPublicDetail } from "@/features/community";

export const Route = createFileRoute("/api/v1/(public)/community/questions/$slug")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      // Privacy boundary lives in community.mappers.ts — author_email / ip /
      // user_agent / utm_json never leave the admin surface.
      GET: ({ request, params }) =>
        handleCommunityDetail(
          request,
          params.slug,
          getPublishedCommunityQuestion,
          toPublicDetail,
          "question",
          `No published question with slug "${params.slug}"`,
        ),
    },
  },
});
