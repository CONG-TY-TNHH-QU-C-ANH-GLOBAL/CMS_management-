import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { corsError, corsJson, corsOptions } from "@/core/middlewares/cors";
import { getClientIp, rateLimit, verifyTurnstile } from "@/core/middlewares/rate-limit";
import {
  createCommunityQuestion,
  isIndexable,
  listPublishedCommunityQuestions,
  type CommunityQuestionJoinedRow,
} from "@/features/community";
import { dispatchEvent } from "@/features/telegram";

const submitSchema = z.object({
  title: z.string().trim().min(8, "Tiêu đề tối thiểu 8 ký tự").max(200),
  body: z.string().trim().min(20, "Nội dung tối thiểu 20 ký tự").max(5000),
  category_slug: z.string().trim().max(80).optional().nullable(),
  author_name: z.string().trim().min(1, "Tên không được rỗng").max(80),
  author_email: z.string().trim().email("Email không hợp lệ").max(254),
  locale: z.enum(["en", "vi", "zh"]).optional().nullable(),
  utm: z.record(z.string()).optional().nullable(),
  turnstile_token: z.string().min(1, "Missing Turnstile token"),
});

function toExcerpt(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > 200 ? flat.slice(0, 200) + "…" : flat;
}

function toSummary(q: CommunityQuestionJoinedRow) {
  return {
    slug: q.slug,
    title: q.title,
    excerpt: toExcerpt(q.body),
    category: q.category_slug && q.category_name ? { slug: q.category_slug, name: q.category_name } : null,
    has_expert_answer: Boolean(q.expert_answer?.trim()),
    verified: q.verified === 1,
    indexable: isIndexable(q),
    same_issue_count: q.same_issue_count,
    published_at: q.published_at,
  };
}

export const Route = createFileRoute("/api/v1/(public)/community/questions/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const category = url.searchParams.get("category") ?? undefined;
        const questions = await listPublishedCommunityQuestions({ categorySlug: category });
        return corsJson(request, { questions: questions.map(toSummary) });
      },
      POST: async ({ request }) => {
        const ip = getClientIp(request);

        // Rate limit: 5 question submissions per IP per hour.
        const rl = await rateLimit("community-questions", ip, { max: 5, windowSeconds: 3600 });
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

        const { id, slug } = await createCommunityQuestion({
          title: data.title,
          body: data.body,
          category_slug: data.category_slug ?? null,
          author_name: data.author_name,
          author_email: data.author_email,
          locale: data.locale ?? null,
          ip,
          user_agent: request.headers.get("user-agent"),
          utm: data.utm ?? null,
        });

        // AWAITED — same rationale as the leads endpoint: fire-and-forget gets
        // cancelled on Workers. Errors are swallowed so a Telegram outage
        // doesn't break the submission (the question row is already persisted).
        try {
          await dispatchEvent({
            event_type: "community_question_received",
            idempotency_key: `community-question:${id}`,
            payload: {
              id,
              slug,
              title: data.title,
              author_name: data.author_name,
              author_email: data.author_email,
              category_slug: data.category_slug ?? null,
            },
          });
        } catch (e) {
          console.error(`[telegram] community_question_received#${id} dispatch failed:`, e);
        }

        // status echoed so landing can show the "pending moderation" state
        // without guessing the server-side default.
        return corsJson(
          request,
          { ok: true, id, slug, status: "pending" },
          { status: 201, headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
