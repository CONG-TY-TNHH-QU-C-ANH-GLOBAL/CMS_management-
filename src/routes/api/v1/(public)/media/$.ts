import { createFileRoute } from "@tanstack/react-router";

import { corsHeaders, corsOptions } from "@/core/middlewares/cors";

// R2 read proxy — landing image tags hit /api/v1/media/<r2_key> where the
// key may contain slashes (e.g. "service-fulfill-gallery/abc123-product.jpg").
// The splat segment `$` captures the full remaining path.
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
