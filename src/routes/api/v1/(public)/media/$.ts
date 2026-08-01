import { createFileRoute } from "@tanstack/react-router";

import { corsHeaders, corsOptions } from "@/core/middlewares/cors";
import { isPrivateObjectKey } from "@/features/media/media.private";

// R2 read proxy — landing image tags hit /api/v1/media/<r2_key> where the
// key may contain slashes (e.g. "service-fulfill-gallery/abc123-product.jpg").
// The splat segment `$` captures the full remaining path.
//
// PRIVATE NAMESPACE: this proxy is the ONLY public exposure of the R2 bucket (wrangler.jsonc
// binds MEDIA with no public bucket domain), so denying a prefix here is a complete boundary,
// not a speed bump. Applicant CVs live under `applicants/` and are served exclusively by the
// authenticated route at /api/v1/applicant-cv/{key}. The check runs on the DECODED key, after
// percent-decoding, so `applicants%2Fx.pdf` cannot slip past it.
export const Route = createFileRoute("/api/v1/(public)/media/$")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => corsOptions(request),
      GET: async ({ request, params }) => {
        const { readMediaObject } = await import("@/features/media");
        const splat = (params as { _splat?: string })._splat ?? "";
        const key = decodeURIComponent(splat);
        if (!key) {
          return new Response("Missing key", { status: 400, headers: corsHeaders(request) });
        }
        // 404, not 403: a 403 would confirm that a given private key exists, which is exactly
        // the enumeration signal the random key is meant to withhold.
        if (isPrivateObjectKey(key)) {
          return new Response("Not found", { status: 404, headers: corsHeaders(request) });
        }
        const obj = await readMediaObject(key);
        if (!obj) {
          return new Response("Not found", { status: 404, headers: corsHeaders(request) });
        }
        return new Response(obj.body, {
          status: 200,
          headers: {
            ...corsHeaders(request),
            "Content-Type": obj.contentType,
            "Content-Length": String(obj.size),
            "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
          },
        });
      },
    },
  },
});
