import { createFileRoute } from "@tanstack/react-router";

import { corsError, corsJson, corsOptions } from "@/core/middlewares/cors";
import { getClientIp, rateLimit, verifyTurnstile } from "@/core/middlewares/rate-limit";
import { createLead, parseLeadRequest } from "@/features/leads";
import { dispatchEvent } from "@/features/telegram";

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

        const parsed = parseLeadRequest(body);
        if (!parsed.ok) {
          return corsError(request, 400, parsed.message);
        }

        const data = parsed.value;
        const ok = await verifyTurnstile(data.turnstile_token, ip);
        if (!ok) {
          return corsError(request, 403, "Turnstile verification failed");
        }

        const userAgent = request.headers.get("user-agent");
        const { id } = await createLead({
          name: data.name,
          email: data.email,
          phone: data.phone,
          message: data.message,
          source_page: data.source_page,
          locale: data.locale,
          ip,
          user_agent: userAgent,
          utm: data.utm,
          primary_service: data.primary_service,
          surface: data.surface,
          service_interests: data.service_interests,
          service_details: data.service_details,
        });

        // Route to subscribed Telegram channels via durable outbox.
        // Idempotency key collapses double-submits to one notification.
        //
        // AWAITED — see the applicants endpoint for the rationale. Fire-and-
        // forget dispatch was being cancelled before .then/.catch could fire,
        // making the chain look silent. Awaiting blocks the response for up to
        // ~5s when Telegram is slow; the outbox cron is still the durability
        // net. Errors are swallowed so a Telegram outage doesn't break the
        // lead insert (lead is already persisted at this point).
        console.log(`[telegram] lead_received#${id}: dispatching…`);
        try {
          const enqueued = await dispatchEvent({
            event_type: "lead_received",
            idempotency_key: `lead:${id}`,
            payload: {
              id,
              name: data.name,
              email: data.email,
              phone: data.phone,
              message: data.message,
              source_page: data.source_page,
              locale: data.locale,
              primary_service: data.primary_service,
              service_interests: data.service_interests,
            },
          });
          console.log(`[telegram] lead_received#${id} enqueued ${enqueued} row(s)`);
        } catch (e) {
          console.error(`[telegram] lead_received#${id} dispatch failed:`, e);
        }

        return corsJson(
          request,
          { ok: true, id },
          { status: 201, headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
