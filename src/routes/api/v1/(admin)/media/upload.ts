import { createFileRoute } from "@tanstack/react-router";

import { withRequiredSession } from "@/features/auth/auth.guard";
import {
  CHUNK_PART_BYTES,
  CHUNKED_MAX_BYTES,
  countParts,
  isSafeMediaKey,
  validateParts,
} from "@/features/media/media.chunked";
import {
  hasPdfSignature,
  maxUploadBytes,
  MONTHLY_SOURCING_MEDIA_TAG,
} from "@/features/monthly-sourcing/monthly-sourcing.validation";
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
const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * Chunked upload for heavy files (R2 multipart), driven by the admin client in 8 MiB parts so
 * no single request has to carry (or the Worker buffer) the whole file:
 *   POST ?action=init      {filename, mime, size, tag}            -> {key, uploadId, partBytes}
 *   PUT  ?action=part&key&uploadId&n   (raw part body)            -> {partNumber, etag}
 *   POST ?action=complete  {key, uploadId, parts, size, mime, alt_text, tag, title} -> {media}
 *   POST ?action=abort     {key, uploadId}                        -> {ok}
 */
async function handleChunked(request: Request, action: string, me: { id: number }): Promise<Response> {
  const media = await import("@/features/media");
  const { hasPdfEofMarker, hasPdfSignature, MONTHLY_SOURCING_MEDIA_TAG } = await import(
    "@/features/monthly-sourcing/monthly-sourcing.validation"
  );
  const url = new URL(request.url);

  if (action === "part" && request.method === "PUT") {
    const key = url.searchParams.get("key");
    const uploadId = url.searchParams.get("uploadId") ?? "";
    const n = Number(url.searchParams.get("n"));
    if (!isSafeMediaKey(key) || !uploadId || !Number.isInteger(n) || n < 1 || n > countParts(CHUNKED_MAX_BYTES)) {
      return jsonResponse(400, { error: "Tham số phần tải không hợp lệ." });
    }
    const body = await request.arrayBuffer();
    if (body.byteLength === 0 || body.byteLength > CHUNK_PART_BYTES) {
      return jsonResponse(413, { error: `Mỗi phần tối đa ${CHUNK_PART_BYTES / 1024 / 1024}MB.` });
    }
    return jsonResponse(200, await media.uploadMediaPart(key, uploadId, n, body));
  }

  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });
  const input = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!input) return jsonResponse(400, { error: "Body JSON không hợp lệ." });

  if (action === "init") {
    const size = Number(input.size);
    const filename = typeof input.filename === "string" ? input.filename : "";
    const mime = typeof input.mime === "string" && input.mime ? input.mime : "application/octet-stream";
    const tag = typeof input.tag === "string" && input.tag ? input.tag : null;
    if (!filename || !Number.isFinite(size) || size <= 0) return jsonResponse(400, { error: "Thiếu tên hoặc kích thước tệp." });
    if (size > CHUNKED_MAX_BYTES) {
      return jsonResponse(413, { error: `File quá lớn (giới hạn ${CHUNKED_MAX_BYTES / 1024 / 1024}MB)` });
    }
    if (tag === MONTHLY_SOURCING_MEDIA_TAG && mime !== "application/pdf") {
      return jsonResponse(422, { error: "Tệp nguồn hàng phải là PDF hợp lệ." });
    }
    const started = await media.startMultipartMedia({ filename, mime, tag });
    return jsonResponse(200, { ...started, partBytes: CHUNK_PART_BYTES });
  }

  const key = input.key;
  const uploadId = typeof input.uploadId === "string" ? input.uploadId : "";
  if (!isSafeMediaKey(key) || !uploadId) return jsonResponse(400, { error: "Khóa tải lên không hợp lệ." });

  if (action === "abort") {
    await media.abortMultipartMedia(key, uploadId).catch(() => undefined);
    return jsonResponse(200, { ok: true });
  }

  if (action === "complete") {
    const size = Number(input.size);
    if (!validateParts(input.parts, size)) return jsonResponse(400, { error: "Danh sách phần tải không hợp lệ." });
    const tag = key.split("/")[0];
    const isMonthly = tag === MONTHLY_SOURCING_MEDIA_TAG;
    const mime = typeof input.mime === "string" && input.mime ? input.mime : "application/octet-stream";
    try {
      const row = await media.completeMultipartMedia(me.id, {
        key,
        uploadId,
        parts: input.parts,
        mime,
        tag,
        alt_text: typeof input.alt_text === "string" ? input.alt_text : "",
        title: typeof input.title === "string" ? input.title : null,
        expectedBytes: size,
        verifyHead: isMonthly ? (head) => mime === "application/pdf" && hasPdfSignature(head) : undefined,
        verifyTail: isMonthly ? hasPdfEofMarker : undefined,
        monthly_pdf_verified: isMonthly,
      });
      return jsonResponse(201, { media: row });
    } catch (error) {
      if (error instanceof media.MultipartRejectedError) {
        return jsonResponse(422, { error: error.message });
      }
      throw error;
    }
  }

  return jsonResponse(400, { error: "action không hợp lệ." });
}

export const Route = createFileRoute("/api/v1/(admin)/media/upload")({
  server: {
    handlers: {
      PUT: withRequiredSession("editor", async ({ request }: { request: Request }, me) =>
        handleChunked(request, new URL(request.url).searchParams.get("action") ?? "", me),
      ),
      POST: withRequiredSession("editor", async ({ request }: { request: Request }, me) => {
        const action = new URL(request.url).searchParams.get("action");
        if (action) return handleChunked(request, action, me);
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

        // Cap per upload to protect the worker (R2 supports up to 5 GB but the Worker heap is
        // 128 MB): 10 MB by default, larger only for monthly sourcing PDFs.
        const limit = maxUploadBytes(tag);
        if (file.size > limit) {
          return new Response(JSON.stringify({ error: `File quá lớn (giới hạn ${limit / 1024 / 1024}MB)` }), {
            status: 413,
            headers: { "Content-Type": "application/json" },
          });
        }

        const buf = await file.arrayBuffer();
        const verifiedMonthlyPdf =
          tag === MONTHLY_SOURCING_MEDIA_TAG &&
          file.type === "application/pdf" &&
          hasPdfSignature(buf);
        if (tag === MONTHLY_SOURCING_MEDIA_TAG && !verifiedMonthlyPdf) {
          return new Response(JSON.stringify({ error: "Tệp nguồn hàng phải là PDF hợp lệ." }), {
            status: 422,
            headers: { "Content-Type": "application/json" },
          });
        }
        const media = await uploadMedia(me.id, {
          filename: file.name,
          mime: file.type || "application/octet-stream",
          bytes: file.size,
          body: buf,
          alt_text: altText,
          tag,
          title,
          monthly_pdf_verified: verifiedMonthlyPdf,
        });

        return new Response(JSON.stringify({ media }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }),
    },
  },
});
