import { createFileRoute } from "@tanstack/react-router";

import { withRequiredSession } from "@/features/auth/auth.guard";
import {
  FormFieldTypeError,
  optionalKeySegmentField,
  optionalTextField,
  optionalTextFieldOrEmpty,
  requiredFileField,
} from "@/features/media/media.form";

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

        // Each field is parsed as its DECLARED type. `String(form.get(...))` used to turn a
        // File submitted under `alt_text` into the literal "[object File]" and persist it as
        // the image's alt text; malformed multipart input must fail, not become metadata.
        let file: File;
        let altText: string;
        let tag: string | null;
        let title: string | null;
        try {
          file = requiredFileField(form, "file");
          altText = optionalTextFieldOrEmpty(form, "alt_text");
          // `tag` is interpolated into the R2 object key, so it is validated as a path segment.
          tag = optionalKeySegmentField(form, "tag");
          title = optionalTextField(form, "title");
        } catch (error) {
          if (!(error instanceof FormFieldTypeError)) throw error;
          // Bounded: names the field, never echoes the submitted value.
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

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
