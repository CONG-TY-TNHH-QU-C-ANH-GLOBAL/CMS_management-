// Browser-side chunked upload for heavy files. Splits the file into 8 MiB parts and sends them
// one request at a time (each retried), so a 20-100 MB file never travels as one request.
import { CHUNK_PART_BYTES, CHUNKED_THRESHOLD_BYTES, countParts } from "./media.chunked";

export interface UploadedMedia {
  id: number;
  mime: string;
  url?: string;
}

interface UploadOptions {
  tag?: string | null;
  title?: string;
  alt_text?: string;
  /** 0..1 */
  onProgress?: (fraction: number) => void;
}

const ENDPOINT = "/api/v1/media/upload";
const PART_ATTEMPTS = 3;

async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? `${res.status} ${res.statusText}`.trim();
}

async function postJson<T>(action: string, payload: unknown): Promise<T> {
  const res = await fetch(`${ENDPOINT}?action=${action}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as T;
}

class NonRetryableError extends Error {}

async function putPart(key: string, uploadId: string, n: number, blob: Blob) {
  const url = `${ENDPOINT}?action=part&key=${encodeURIComponent(key)}&uploadId=${encodeURIComponent(uploadId)}&n=${n}`;
  let lastError: unknown;
  for (let attempt = 1; attempt <= PART_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { method: "PUT", credentials: "include", body: blob });
      if (res.ok) return (await res.json()) as { partNumber: number; etag: string };
      const message = await readError(res);
      // A 4xx will not improve on retry; a 5xx or a dropped connection might.
      if (res.status < 500) throw new NonRetryableError(message);
      lastError = new Error(message);
    } catch (error) {
      if (error instanceof NonRetryableError) throw error;
      lastError = error;
    }
    await new Promise((r) => setTimeout(r, 500 * attempt));
  }
  throw lastError instanceof Error ? lastError : new Error("Tải phần tệp thất bại.");
}

/** Single request for small files, chunked multipart above the threshold. */
export async function uploadMediaFile(file: File, opts: UploadOptions = {}): Promise<UploadedMedia> {
  const tag = opts.tag ?? null;
  const alt_text = opts.alt_text ?? file.name;

  if (file.size <= CHUNKED_THRESHOLD_BYTES) {
    const form = new FormData();
    form.append("file", file);
    form.append("alt_text", alt_text);
    if (opts.title) form.append("title", opts.title);
    if (tag) form.append("tag", tag);
    const res = await fetch(ENDPOINT, { method: "POST", body: form, credentials: "include" });
    if (!res.ok) throw new Error(await readError(res));
    opts.onProgress?.(1);
    return ((await res.json()) as { media: UploadedMedia }).media;
  }

  const mime = file.type || "application/octet-stream";
  const { key, uploadId } = await postJson<{ key: string; uploadId: string }>("init", {
    filename: file.name,
    mime,
    size: file.size,
    tag,
  });

  try {
    const total = countParts(file.size);
    const parts: { partNumber: number; etag: string }[] = [];
    for (let n = 1; n <= total; n++) {
      const blob = file.slice((n - 1) * CHUNK_PART_BYTES, Math.min(n * CHUNK_PART_BYTES, file.size));
      parts.push(await putPart(key, uploadId, n, blob));
      opts.onProgress?.(n / total);
    }
    const { media } = await postJson<{ media: UploadedMedia }>("complete", {
      key,
      uploadId,
      parts,
      size: file.size,
      mime,
      alt_text,
      title: opts.title,
    });
    return media;
  } catch (error) {
    await postJson("abort", { key, uploadId }).catch(() => undefined);
    throw error;
  }
}
