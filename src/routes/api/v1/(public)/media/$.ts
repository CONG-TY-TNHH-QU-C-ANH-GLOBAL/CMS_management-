import { createFileRoute } from "@tanstack/react-router";

import { corsHeaders, corsOptions } from "@/core/middlewares/cors";
import { isPrivateObjectKey } from "@/features/media/media.private";
import { parseByteRange } from "@/features/media/media.range";

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
        const { headMediaObject, readMediaObject } = await import("@/features/media");
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
        const baseHeaders = {
          ...corsHeaders(request),
          // Lets a cross-origin PDF viewer see the size and that ranges are supported.
          "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
        };
        const rangeHeader = request.headers.get("range");
        if (rangeHeader) {
          const head = await headMediaObject(key);
          if (!head) return new Response("Not found", { status: 404, headers: corsHeaders(request) });
          const range = parseByteRange(rangeHeader, head.size);
          if (range === null) {
            return new Response(null, {
              status: 416,
              headers: { ...baseHeaders, "Content-Range": `bytes */${head.size}` },
            });
          }
          if (range) {
            const part = await readMediaObject(key, range);
            if (!part) return new Response("Not found", { status: 404, headers: corsHeaders(request) });
            return new Response(part.body, {
              status: 206,
              headers: {
                ...baseHeaders,
                "Content-Type": part.contentType,
                "Content-Length": String(range.length),
                "Content-Range": `bytes ${range.offset}-${range.offset + range.length - 1}/${part.size}`,
              },
            });
          }
        }
        const obj = await readMediaObject(key);
        if (!obj) {
          return new Response("Not found", { status: 404, headers: corsHeaders(request) });
        }
        return new Response(obj.body, {
          status: 200,
          headers: { ...baseHeaders, "Content-Type": obj.contentType, "Content-Length": String(obj.size) },
        });
      },
    },
  },
});
