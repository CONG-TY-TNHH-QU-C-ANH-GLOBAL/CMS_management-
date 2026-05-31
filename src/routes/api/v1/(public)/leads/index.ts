import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { corsError, corsJson, corsOptions } from "@/core/middlewares/cors";
import { getClientIp, rateLimit, verifyTurnstile } from "@/core/middlewares/rate-limit";
import { createLead } from "@/features/leads";
import { dispatchEvent } from "@/features/telegram";

const leadSchema = z.object({
  name: z.string().trim().min(1, "Tên không được rỗng").max(120),
  email: z.string().trim().email("Email không hợp lệ").max(254),
  phone: z.string().trim().max(40).optional().nullable(),
  message: z.string().trim().max(2000).optional().nullable(),
  source_page: z.string().trim().max(500).optional().nullable(),
  locale: z.enum(["en", "vi", "zh"]).optional().nullable(),
  utm: z.record(z.string()).optional().nullable(),
  turnstile_token: z.string().min(1, "Missing Turnstile token"),
});

export const Route = createFileRoute("/api/v1/(public)/leads/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      POST: async ({ request }) => {
        const ip = getClientIp(request);

        // Rate limit: 10 submissions per IP per hour.
        const rl = await rateLimit("leads", ip, { max: 10, windowSeconds: 3600 });
        if (!rl.allowed) {
          return corsError(request, 429, "Quá nhiều yêu cầu. Thử lại sau 1 giờ.");
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return corsError(request, 400, "Body phải là JSON hợp lệ");
        }

        const parsed = leadSchema.safeParse(body);
        if (!parsed.success) {
          const first = parsed.error.errors[0];
          return corsError(request, 400, first?.message ?? "Validation failed");
        }

        const data = parsed.data;
        const ok = await verifyTurnstile(data.turnstile_token, ip);
        if (!ok) {
          return corsError(request, 403, "Turnstile verification failed");
        }

        const userAgent = request.headers.get("user-agent");
        const { id } = await createLead({
          name: data.name,
          email: data.email,
          phone: data.phone ?? null,
          message: data.message ?? null,
          source_page: data.source_page ?? null,
          locale: data.locale ?? null,
          ip,
          user_agent: userAgent,
          utm: data.utm ?? null,
        });

        // Route to subscribed Telegram channels via durable outbox.
        // Idempotency key collapses double-submits to one notification.
        // DIAGNOSTIC: log catch errors so Telegram silent-failure is visible in
        // `wrangler tail` / Cloudflare dashboard logs. Remove this logging once
        // the dispatch chain is confirmed working in prod.
        dispatchEvent({
          event_type: "lead_received",
          idempotency_key: `lead:${id}`,
          payload: {
            id,
            name: data.name,
            email: data.email,
            phone: data.phone ?? null,
            message: data.message ?? null,
            source_page: data.source_page ?? null,
            locale: data.locale ?? null,
          },
        })
          .then((n) => console.log(`[telegram] lead_received#${id} enqueued ${n} row(s)`))
          .catch((e) => console.error(`[telegram] lead_received#${id} dispatch failed:`, e));

        return corsJson(
          request,
          { ok: true, id },
          { status: 201, headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
