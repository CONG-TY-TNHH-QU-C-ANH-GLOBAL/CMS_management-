import { createFileRoute } from "@tanstack/react-router";

import { corsError, corsJson, corsOptions } from "@/core/middlewares/cors";
import { getClientIp, rateLimit } from "@/core/middlewares/rate-limit";
import { addSameIssueReaction } from "@/features/community";

export const Route = createFileRoute("/api/v1/(public)/community/questions/$slug/same-issue")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      POST: async ({ request, params }) => {
        const ip = getClientIp(request);

        // No Turnstile on a one-click reaction (UX): abuse control is the
        // per-IP rate limit + per-(question, hashed-IP) dedupe in the service.
        const rl = await rateLimit("community-react", ip, { max: 30, windowSeconds: 3600 });
        if (!rl.allowed) {
          return corsError(request, 429, "Quá nhiều yêu cầu. Thử lại sau 1 giờ.");
        }

        const result = await addSameIssueReaction(params.slug, ip);
        if (!result) {
          return corsError(request, 404, `No published question with slug "${params.slug}"`);
        }
        return corsJson(
          request,
          { ok: true, same_issue_count: result.same_issue_count, deduped: result.deduped },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
