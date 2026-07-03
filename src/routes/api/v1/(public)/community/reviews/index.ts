import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { corsError, corsJson, corsOptions } from "@/core/middlewares/cors";
import { getClientIp, rateLimit, verifyTurnstile } from "@/core/middlewares/rate-limit";
import {
  createCommunityReview,
  listPublishedCommunityReviews,
  toPublicReviewSummary,
} from "@/features/community";

const submitSchema = z.object({
  title: z.string().trim().min(8, "Tiêu đề tối thiểu 8 ký tự").max(200),
  body: z.string().trim().min(20, "Nội dung tối thiểu 20 ký tự").max(5000),
  category_slug: z.string().trim().max(80).optional().nullable(),
  reviewer_name: z.string().trim().min(1, "Tên không được rỗng").max(80),
  reviewer_email: z.string().trim().email("Email không hợp lệ").max(254),
  rating: z.number().int().min(1).max(5).optional().nullable(),
  locale: z.enum(["en", "vi", "zh"]).optional().nullable(),
  // Private, admin-only moderation context — never surfaced publicly.
  private_evidence_note: z.string().trim().max(2000).optional().nullable(),
  private_order_reference: z.string().trim().max(200).optional().nullable(),
  utm: z.record(z.string()).optional().nullable(),
  turnstile_token: z.string().min(1, "Missing Turnstile token"),
});

export const Route = createFileRoute("/api/v1/(public)/community/reviews/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const category = url.searchParams.get("category") ?? undefined;
        const reviews = await listPublishedCommunityReviews({ categorySlug: category });
        return corsJson(request, { reviews: reviews.map(toPublicReviewSummary) });
      },
      POST: async ({ request }) => {
        const ip = getClientIp(request);

        // Rate limit: 5 review submissions per IP per hour.
        const rl = await rateLimit("community-reviews", ip, { max: 5, windowSeconds: 3600 });
        if (!rl.allowed) {
          return corsError(request, 429, "Quá nhiều yêu cầu. Thử lại sau 1 giờ.");
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return corsError(request, 400, "Body phải là JSON hợp lệ");
        }

        const parsed = submitSchema.safeParse(body);
        if (!parsed.success) {
          const first = parsed.error.errors[0];
          return corsError(request, 400, first?.message ?? "Validation failed");
        }

        const data = parsed.data;
        const ok = await verifyTurnstile(data.turnstile_token, ip);
        if (!ok) {
          return corsError(request, 403, "Turnstile verification failed");
        }

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
