import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { corsJson, corsOptions } from "@/core/middlewares/cors";
import { guardCommunitySubmit, handleCommunityList } from "@/features/community/community.http";
import {
  createCommunityQuestion,
  listPublishedCommunityQuestions,
  toPublicSummary,
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

export const Route = createFileRoute("/api/v1/(public)/community/questions/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: ({ request }) =>
        handleCommunityList(request, "questions", listPublishedCommunityQuestions, toPublicSummary),
      POST: async ({ request }) => {
        // Rate limit (5/hr), JSON, schema + Turnstile — shared guard.
        const guard = await guardCommunitySubmit(request, "community-questions", submitSchema);
        if (guard instanceof Response) return guard;
        const { ip, data } = guard;

        const { id, slug, ownerToken } = await createCommunityQuestion({
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
        // without guessing the server-side default. owner_token is returned
        // ONCE here (never in list/detail) — the browser stores it to enable
        // self-service withdrawal.
        return corsJson(
          request,
          { ok: true, id, slug, status: "pending", owner_token: ownerToken },
          { status: 201, headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
