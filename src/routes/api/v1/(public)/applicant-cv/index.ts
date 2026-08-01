// Public CV upload endpoint for applicants. Accepts multipart/form-data with a single "file"
// field (PDF/DOC/DOCX, ≤10MB), stores it in R2 under the PRIVATE `applicants/` namespace, and
// returns the AUTHENTICATED retrieval URL. That URL is attached to the application via
// POST /api/v1/applicants → cv_url.
//
// The returned URL is NOT a bearer URL. It points at /api/v1/applicant-cv/{key}, which
// requires an authenticated CMS session; the public media proxy refuses the `applicants/`
// prefix outright. The random key remains a collision-resistant private identifier — it is no
// longer the access control, which is what it used to be described as and never was.

import { createFileRoute } from "@tanstack/react-router";

import { corsError, corsJson, corsOptions } from "@/core/middlewares/cors";
import { getClientIp, rateLimit } from "@/core/middlewares/rate-limit";
import { APPLICANT_CV_PREFIX } from "@/features/media/media.private";
import { applicantCvUrlPath } from "@/features/careers/careers.cv";

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

/** Unguessable object-key prefix for a CV upload.
 *
 *  The stored object is reachable through the public /api/v1/media/{key} proxy, so this random
 *  component IS the access control on an applicant's CV — the route classification records that
 *  explicitly. It must therefore be cryptographically random: Math.random() is a seeded PRNG
 *  whose output is predictable from observed values, which would let someone who has seen one
 *  CV URL derive others. crypto.getRandomValues is available in the Workers runtime.
 *
 *  128 bits, base36-encoded. The key SHAPE is unchanged (`applicants/<id>-<name>.<ext>`), so
 *  every already-issued URL keeps working and no consumer changes. */
function shortId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("");
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
        // APPLICANT_CV_PREFIX is the same constant the public media proxy denies, so the write
        // location and the deny rule cannot drift apart.
        const key = `${APPLICANT_CV_PREFIX}${shortId()}-${baseName}.${ext}`;

        await env.MEDIA.put(key, file.stream(), {
          httpMetadata: { contentType: file.type },
        });

        // Authenticated retrieval path — never the public media proxy.
        const url = `${env.BASE_URL}${applicantCvUrlPath(key)}`;
        return corsJson(request, { ok: true, url, filename: file.name, size: file.size });
      },
    },
  },
});
