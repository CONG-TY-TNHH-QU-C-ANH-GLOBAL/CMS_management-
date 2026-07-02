import { createFileRoute } from "@tanstack/react-router";

import { corsError, corsJson, corsOptions } from "@/core/middlewares/cors";
import { getPublishedCommunityQuestion, isIndexable } from "@/features/community";

export const Route = createFileRoute("/api/v1/(public)/community/questions/$slug")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request, params }) => {
        const q = await getPublishedCommunityQuestion(params.slug);
        if (!q) {
          return corsError(request, 404, `No published question with slug "${params.slug}"`);
        }
        // Privacy: author_email / ip / user_agent / utm_json never leave the
        // admin surface — see community.schemas.ts header.
        return corsJson(request, {
          question: {
            slug: q.slug,
            title: q.title,
            body: q.body,
            category:
              q.category_slug && q.category_name
                ? { slug: q.category_slug, name: q.category_name }
                : null,
            author_name: q.author_name,
            expert_answer: q.expert_answer,
            expert_answer_updated_at: q.expert_answer_updated_at,
            verified: q.verified === 1,
            indexable: isIndexable(q),
            same_issue_count: q.same_issue_count,
            published_at: q.published_at,
          },
        });
      },
    },
  },
});
