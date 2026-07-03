import { createFileRoute } from "@tanstack/react-router";

import { corsError, corsJson, corsOptions } from "@/core/middlewares/cors";
import { getPublishedCommunityQuestion, toPublicDetail } from "@/features/community";

export const Route = createFileRoute("/api/v1/(public)/community/questions/$slug")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request, params }) => {
        const q = await getPublishedCommunityQuestion(params.slug);
        if (!q) {
          return corsError(request, 404, `No published question with slug "${params.slug}"`);
        }
        // Privacy boundary lives in community.mappers.ts — author_email / ip /
        // user_agent / utm_json never leave the admin surface.
        return corsJson(request, { question: toPublicDetail(q) });
      },
    },
  },
});
