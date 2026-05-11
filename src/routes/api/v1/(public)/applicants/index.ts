import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { corsError, corsJson, corsOptions } from "@/core/middlewares/cors";
import { getClientIp, rateLimit, verifyTurnstile } from "@/core/middlewares/rate-limit";
import { createApplicant, getCareersJob } from "@/features/careers";
import { formatApplicantMessage, notifyTelegram } from "@/features/telegram";

const applicantSchema = z.object({
  job_slug: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1, "Tên không được rỗng").max(120),
  email: z.string().trim().email("Email không hợp lệ").max(254),
  phone: z.string().trim().max(40).optional().nullable(),
  cv_url: z.string().trim().url("CV URL không hợp lệ").max(1000).optional().nullable(),
  cover_letter: z.string().trim().max(5000).optional().nullable(),
  locale: z.enum(["en", "vi", "zh"]),
  source_page: z.string().trim().max(500).optional().nullable(),
  utm: z.record(z.string()).optional().nullable(),
  turnstile_token: z.string().min(1, "Missing Turnstile token"),
});

export const Route = createFileRoute("/api/v1/(public)/applicants/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      POST: async ({ request }) => {
        const ip = getClientIp(request);

        // Stricter rate limit: 5/h per IP — applicants are higher-cost than leads.
        const rl = await rateLimit("applicants", ip, { max: 5, windowSeconds: 3600 });
        if (!rl.allowed) {
          return corsError(request, 429, "Quá nhiều lượt nộp. Thử lại sau 1 giờ.");
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return corsError(request, 400, "Body phải là JSON hợp lệ");
        }

        const parsed = applicantSchema.safeParse(body);
        if (!parsed.success) {
          return corsError(request, 400, parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
        }
        const input = parsed.data;

        // Verify the job exists + open before accepting application.
        const job = await getCareersJob(input.job_slug, input.locale);
        if (!job || job.status !== "open") {
          return corsError(request, 404, `Job "${input.job_slug}" không tồn tại hoặc đã đóng.`);
        }

        // Turnstile verification (DEV_BYPASS allowed when TURNSTILE_SECRET unset)
        const ok = await verifyTurnstile(input.turnstile_token, ip);
        if (!ok) return corsError(request, 403, "Turnstile verification failed");

        const inserted = await createApplicant({
          job_slug: input.job_slug,
          name: input.name,
          email: input.email,
          phone: input.phone ?? null,
          cv_url: input.cv_url ?? null,
          cover_letter: input.cover_letter ?? null,
          locale: input.locale,
          source_page: input.source_page ?? null,
          utm: input.utm ?? undefined,
          ip,
          user_agent: request.headers.get("user-agent") ?? null,
        });

        // Fire-and-forget Telegram notify
        notifyTelegram({
          event: "new_applicant",
          text: formatApplicantMessage({
            id: inserted.id,
            name: input.name,
            email: input.email,
            phone: input.phone ?? null,
            cv_url: input.cv_url ?? null,
            cover_letter: input.cover_letter ?? null,
            job_slug: input.job_slug,
            job_title: job.title,
            locale: input.locale,
          }),
        }).catch(() => {});

        return corsJson(request, { ok: true, id: inserted.id });
      },
    },
  },
});
