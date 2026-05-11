// Public CV upload endpoint for applicants. Accepts multipart/form-data
// with a single "file" field (PDF/DOC/DOCX, ≤10MB), uploads to R2 under
// applicants/<nanoid>-<safe-filename>, returns the public URL. The URL
// is later attached to the application via POST /api/v1/applicants → cv_url.
//
// Random key acts as security-through-obscurity — only HR + applicant who
// submitted have the URL. Adequate for a low-volume careers funnel.

import { createFileRoute } from "@tanstack/react-router";

import { corsError, corsJson, corsOptions } from "@/core/middlewares/cors";
import { getClientIp, rateLimit } from "@/core/middlewares/rate-limit";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9.\-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8);
}

export const Route = createFileRoute("/api/v1/(public)/applicant-cv/")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      POST: async ({ request }) => {
        const { env } = await import("cloudflare:workers");
        const ip = getClientIp(request);

        // Conservative rate limit: 5 uploads/h per IP (matches applicant submit cap)
        const rl = await rateLimit("applicant-cv", ip, { max: 5, windowSeconds: 3600 });
        if (!rl.allowed) {
          return corsError(request, 429, "Đã upload quá nhiều lần. Thử lại sau 1 giờ.");
        }

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return corsError(request, 400, "Body phải là multipart/form-data");
        }
        const file = form.get("file");
        if (!(file instanceof File)) {
          return corsError(request, 400, "Thiếu file CV");
        }
        if (file.size > MAX_BYTES) {
          return corsError(request, 413, "File quá lớn — tối đa 10MB");
        }
        if (!ALLOWED_MIMES.has(file.type)) {
          return corsError(request, 415, "Chỉ chấp nhận PDF, DOC, DOCX");
        }

        const ext = EXT_BY_MIME[file.type] ?? "bin";
        const baseName = slugify(file.name.replace(/\.[^.]+$/, "")) || "cv";
        const key = `applicants/${shortId()}-${baseName}.${ext}`;

        await env.MEDIA.put(key, file.stream(), {
          httpMetadata: { contentType: file.type },
        });

        const url = `${env.BASE_URL}/api/v1/media/${encodeURIComponent(key)}`;
        return corsJson(request, { ok: true, url, filename: file.name, size: file.size });
      },
    },
  },
});
