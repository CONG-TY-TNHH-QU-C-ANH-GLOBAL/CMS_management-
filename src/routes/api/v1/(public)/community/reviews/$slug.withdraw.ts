import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { corsError, corsJson, corsOptions } from "@/core/middlewares/cors";
import { getClientIp, rateLimit } from "@/core/middlewares/rate-limit";
import { withdrawCommunityReview } from "@/features/community";

const withdrawSchema = z.object({
  ownerToken: z.string().min(1),
});

export const Route = createFileRoute("/api/v1/(public)/community/reviews/$slug/withdraw")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      POST: async ({ request, params }) => {
        const ip = getClientIp(request);

        // Rate limit: cap brute-force attempts against owner tokens.
        const rl = await rateLimit("community-review-withdraw", ip, { max: 20, windowSeconds: 3600 });
        if (!rl.allowed) {
          return corsError(request, 429, "Quá nhiều yêu cầu. Thử lại sau 1 giờ.");
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return corsError(request, 400, "Body phải là JSON hợp lệ");
        }

        const parsed = withdrawSchema.safeParse(body);
        if (!parsed.success) {
          return corsError(request, 400, "Thiếu ownerToken");
        }

        const ok = await withdrawCommunityReview(params.slug, parsed.data.ownerToken);
        // Generic response either way — do NOT reveal whether the slug exists
        // or the token was merely wrong (no ownership enumeration).
        if (!ok) {
          return corsError(request, 404, "Không thể rút đánh giá này.");
        }
        return corsJson(
          request,
          { ok: true, withdrawn: true },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
