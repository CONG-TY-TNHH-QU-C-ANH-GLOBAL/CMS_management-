import { createFileRoute } from "@tanstack/react-router";

import { withRequiredSession } from "@/features/auth/auth.guard";
import { APPLICANT_CV_PREFIX } from "@/features/media/media.private";

// AUTHENTICATED applicant-CV retrieval. This is the only way to read a CV.
//
// It replaces the previous arrangement, where the upload handler returned a permanent
// `/api/v1/media/applicants/<random>-<name>.pdf` URL and the public proxy served it to anyone
// who had the link, cached `public, immutable` for a week. That made the random key a bearer
// token with no expiry and no revocation — and the URL was stored in D1, sent to a Telegram
// channel and rendered as a plain anchor in the admin UI.
//
// AUTHORIZATION LEVEL. `viewer`, matching `listCareersApplicantsFn`, which already returns the
// applicant's name, email, phone and cover letter to a viewer. The CV inherits the
// authorization of the record it belongs to; giving it a *higher* bar than the PII beside it
// would be incoherent and would break the existing HR workflow. Raising both together is a
// product decision, not something to smuggle in here.
//
// Same-origin admin surface, so no CORS headers — matching (admin)/media/upload.
export const Route = createFileRoute("/api/v1/(admin)/applicant-cv/$")({
  server: {
    handlers: {
      GET: withRequiredSession("viewer", async ({ params }: { params: unknown }) => {
        const { readMediaObject } = await import("@/features/media");
        const splat = (params as { _splat?: string })._splat ?? "";
        const key = decodeURIComponent(splat);

        // Scope the route to the applicant namespace. Without this the endpoint would be a
        // generic authenticated read of the whole bucket — a different, wider capability than
        // "an HR user may read a CV".
        if (!key.startsWith(APPLICANT_CV_PREFIX) || key.includes("..")) {
          return notFound();
        }

        const object = await readMediaObject(key);
        // Indistinguishable from an unauthorized key shape above: a missing object and an
        // out-of-scope key both answer 404, so neither response reveals what exists in storage.
        if (!object) return notFound();

        return new Response(object.body, {
          status: 200,
          headers: {
            // The uploader restricts stored CVs to PDF/DOC/DOCX, but the stored content type
            // is still attacker-influenced input. Serving it back verbatim with nosniff and an
            // attachment disposition means the browser downloads the file rather than
            // rendering it in the CMS origin, so a mislabelled upload cannot become stored XSS
            // against an authenticated HR session.
            "Content-Type": object.contentType,
            "Content-Length": String(object.size),
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": "attachment",
            // The whole point: never shared-cacheable. `private` keeps it out of any CDN or
            // proxy cache; `no-store` keeps it out of the browser's disk cache too, so a CV
            // does not survive on a shared machine after logout.
            "Cache-Control": "private, no-store, max-age=0",
            // A CV filename can carry the applicant's name; do not leak it to any outbound
            // link the browser follows from this response.
            "Referrer-Policy": "no-referrer",
          },
        });
      }),
    },
  },
});

/** Uniform not-found. No storage detail, no key echo, no distinction between "wrong shape",
 *  "not in the applicant namespace" and "no such object". */
function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "Cache-Control": "private, no-store" },
  });
}
