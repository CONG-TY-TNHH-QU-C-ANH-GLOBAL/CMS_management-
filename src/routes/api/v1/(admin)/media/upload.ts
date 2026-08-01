import { createFileRoute } from "@tanstack/react-router";

import { withRequiredSession } from "@/features/auth/auth.guard";

// Admin-only multipart upload endpoint. Stores file in R2 + metadata in D1.
// The admin Media Library page POSTs FormData here (file + alt_text + tag).
// We don't put this behind CORS — same-origin from /admin/* SPA.
//
// Authorization is `withRequiredSession("editor")`, which runs the session + CSRF check before
// the handler body and brands the handler with the role it enforces. The brand is what
// src/openapi/public-surface.test.ts reads — it verifies authorization against the actual
// registered handler value rather than by grepping this file for `requireSession(`.
export const Route = createFileRoute("/api/v1/(admin)/media/upload")({
  server: {
    handlers: {
      POST: withRequiredSession("editor", async ({ request }: { request: Request }, me) => {
        const { uploadMedia } = await import("@/features/media");

        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File)) {
          return new Response(JSON.stringify({ error: "Missing file" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const altText = String(form.get("alt_text") ?? "");
        const tagRaw = form.get("tag");
        const titleRaw = form.get("title");
        const tag = typeof tagRaw === "string" && tagRaw.trim() ? tagRaw.trim() : null;
        const title = typeof titleRaw === "string" && titleRaw.trim() ? titleRaw.trim() : null;

        // Cap at 10 MB per upload to protect the worker (R2 supports up to 5 GB
        // but we don't want admin to accidentally upload monster files).
        if (file.size > 10 * 1024 * 1024) {
          return new Response(JSON.stringify({ error: "File quá lớn (giới hạn 10MB)" }), {
            status: 413,
            headers: { "Content-Type": "application/json" },
          });
        }

        const buf = await file.arrayBuffer();
        const media = await uploadMedia(me.id, {
          filename: file.name,
          mime: file.type || "application/octet-stream",
          bytes: file.size,
          body: buf,
          alt_text: altText,
          tag,
          title,
        });

        return new Response(JSON.stringify({ media }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }),
    },
  },
});
