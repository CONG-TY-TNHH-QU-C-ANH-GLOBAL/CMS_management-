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
  /** fraction 0..1 by bytes sent; speed in bytes/s and eta in seconds once measurable. */
  onProgress?: (fraction: number, stats?: { bytesPerSec: number; etaSec: number }) => void;
}

const ENDPOINT = "/api/v1/media/upload";
const PART_ATTEMPTS = 3;
// Two streams use a weak uplink as well as four, without starving each other into stalls.
const PART_CONCURRENCY = 2;
/** A part that makes no byte progress for this long is aborted and retried instead of hanging. */
const STALL_MS = 30_000;

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

interface PartResult {
  partNumber: number;
  etag: string;
}

/** PUT one part through XHR (fetch has no upload progress), reporting bytes sent so far. */
function sendPart(url: string, blob: Blob, onBytes: (loaded: number) => void): Promise<PartResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.withCredentials = true;
    let lastLoaded = -1;
    let lastChange = Date.now();
    const watchdog = setInterval(() => {
      if (Date.now() - lastChange > STALL_MS) {
        clearInterval(watchdog);
        xhr.abort();
        reject(new Error("Kết nối bị treo, đang thử lại."));
      }
    }, 2_000);
    xhr.upload.onprogress = (e) => {
      if (e.loaded !== lastLoaded) {
        lastLoaded = e.loaded;
        lastChange = Date.now();
      }
      onBytes(e.loaded);
    };
    xhr.onerror = () => {
      clearInterval(watchdog);
      reject(new Error("Mất kết nối khi tải phần tệp."));
    };
    xhr.onload = () => {
      clearInterval(watchdog);
      let body: { error?: string; partNumber?: number; etag?: string } | null = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && body?.etag && body.partNumber) {
        return resolve({ partNumber: body.partNumber, etag: body.etag });
      }
      const message = body?.error ?? `${xhr.status} ${xhr.statusText}`.trim();
      // A 4xx will not improve on retry; a 5xx or a dropped connection might.
      reject(xhr.status >= 400 && xhr.status < 500 ? new NonRetryableError(message) : new Error(message));
    };
    xhr.send(blob);
  });
}

async function putPart(key: string, uploadId: string, n: number, blob: Blob, onBytes: (loaded: number) => void) {
  const url = `${ENDPOINT}?action=part&key=${encodeURIComponent(key)}&uploadId=${encodeURIComponent(uploadId)}&n=${n}`;
  let lastError: unknown;
  for (let attempt = 1; attempt <= PART_ATTEMPTS; attempt++) {
    try {
      return await sendPart(url, blob, onBytes);
    } catch (error) {
      if (error instanceof NonRetryableError) throw error;
      lastError = error;
      onBytes(0);
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
    const parts = new Array<PartResult>(total);
    const sentByPart = new Array<number>(total).fill(0);
    const startedAt = performance.now();
    const report = () => {
      const sent = sentByPart.reduce((sum, v) => sum + v, 0);
      const seconds = (performance.now() - startedAt) / 1000;
      const bytesPerSec = seconds > 0.5 ? sent / seconds : 0;
      const etaSec = bytesPerSec > 0 ? Math.max(0, (file.size - sent) / bytesPerSec) : 0;
      opts.onProgress?.(Math.min(1, sent / file.size), bytesPerSec > 0 ? { bytesPerSec, etaSec } : undefined);
    };
    // Uploading parts concurrently hides per-request latency; each part keeps its own retry.
    let next = 1;
    let failed = false;
    const worker = async () => {
      while (!failed) {
        const n = next++;
        if (n > total) return;
        const blob = file.slice((n - 1) * CHUNK_PART_BYTES, Math.min(n * CHUNK_PART_BYTES, file.size));
        try {
          parts[n - 1] = await putPart(key, uploadId, n, blob, (loaded) => {
            sentByPart[n - 1] = loaded;
            report();
          });
          sentByPart[n - 1] = blob.size;
          report();
        } catch (error) {
          failed = true;
          throw error;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PART_CONCURRENCY, total) }, worker));
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
