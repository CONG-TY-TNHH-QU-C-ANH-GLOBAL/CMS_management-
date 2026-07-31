import { createFileRoute } from "@tanstack/react-router";

import { corsJson, corsOptions } from "@/core/middlewares/cors";
import { guardCommunitySubmit, handleCommunityList } from "@/features/community/community.http";
import { communityReviewSubmitSchema } from "@/features/community/community.schemas";
import {
  createCommunityReview,
  listPublishedCommunityReviews,
  toPublicReviewSummary,
} from "@/features/community";

export const Route = createFileRoute("/api/v1/(public)/community/reviews/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: ({ request }) =>
        handleCommunityList(request, "reviews", listPublishedCommunityReviews, toPublicReviewSummary),
      POST: async ({ request }) => {
        // Rate limit (5/hr), JSON, schema + Turnstile — shared guard.
        const guard = await guardCommunitySubmit(
          request,
          "community-reviews",
          communityReviewSubmitSchema,
        );
        if (guard instanceof Response) return guard;
        const { ip, data } = guard;

        const { id, slug, ownerToken } = await createCommunityReview({
          title: data.title,
          body: data.body,
          category_slug: data.category_slug ?? null,
          reviewer_name: data.reviewer_name,
          reviewer_email: data.reviewer_email,
          rating: data.rating ?? null,
          locale: data.locale ?? null,
          private_evidence_note: data.private_evidence_note ?? null,
          private_order_reference: data.private_order_reference ?? null,
          ip,
          user_agent: request.headers.get("user-agent"),
          utm: data.utm ?? null,
        });

        // ponytail: no Telegram dispatch for reviews yet — pending reviews
        // already surface in the CMS moderation queue (source of truth). Add a
        // `community_review_received` event to src/features/telegram when ops
        // want the ping (registry + formatter + subscription seed).
        //
        // status echoed so landing can show the "pending moderation" state;
        // owner_token is returned ONCE here (never in list/detail) so the
        // browser can self-service withdraw.
        return corsJson(
          request,
          { ok: true, id, slug, status: "pending", owner_token: ownerToken },
          { status: 201, headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
