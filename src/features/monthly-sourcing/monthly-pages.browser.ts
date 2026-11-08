// Browser-only: renders each page of a monthly sourcing PDF to a small WebP and uploads it, so the
// public landing page can show page 1 immediately instead of downloading the whole PDF.
//
// pdf.js is loaded at runtime from a CDN (the same version the landing page used) rather than
// bundled: it never enters the Worker bundle, so it cannot affect server boot.
import { uploadMediaFile } from "@/features/media/media.upload-client";

import {
  MONTHLY_SOURCING_MAX_PAGES,
  MONTHLY_SOURCING_PAGE_TAG,
} from "./monthly-sourcing.validation";

const PDFJS_BASE = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build";
/** Rendered width in device pixels: sharp up to ~880 CSS px at 1.35x, ~150-400 KB per page as WebP. */
const TARGET_WIDTH = 1200;
const WEBP_QUALITY = 0.82;
const UPLOAD_CONCURRENCY = 3;

export interface RenderedPageRef {
  page_no: number;
  media_id: number;
  width: number;
  height: number;
}

interface PdfPageProxy {
  getViewport(opts: { scale: number }): { width: number; height: number };
  render(opts: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void> };
  cleanup(): void;
}
interface PdfDocumentProxy {
  numPages: number;
  getPage(n: number): Promise<PdfPageProxy>;
  destroy(): Promise<void>;
}
interface PdfJsLib {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(src: { data: ArrayBuffer }): { promise: Promise<PdfDocumentProxy> };
}

async function loadPdfJs(): Promise<PdfJsLib> {
  const lib = (await import(/* @vite-ignore */ `${PDFJS_BASE}/pdf.min.mjs`)) as PdfJsLib;
  lib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.mjs`;
  return lib;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (webp) => {
        if (webp && webp.type === "image/webp") return resolve(webp);
        // Browsers without WebP encoding silently produce PNG; JPEG is far smaller for photos.
        canvas.toBlob(
          (jpeg) => (jpeg ? resolve(jpeg) : reject(new Error("Không tạo được ảnh trang."))),
          "image/jpeg",
          WEBP_QUALITY,
        );
      },
      "image/webp",
      WEBP_QUALITY,
    );
  });
}

export interface GenerateOptions {
  monthId: number;
  month: number;
  pdfData: ArrayBuffer;
  onStatus?: (text: string) => void;
}

/** Renders and uploads every page; resolves with the references to save, in page order. */
export async function renderAndUploadMonthPages(opts: GenerateOptions): Promise<RenderedPageRef[]> {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: opts.pdfData }).promise;
  try {
    const total = doc.numPages;
    if (total > MONTHLY_SOURCING_MAX_PAGES) {
      throw new Error(`PDF có ${total} trang, tối đa ${MONTHLY_SOURCING_MAX_PAGES}.`);
    }
    const refs: RenderedPageRef[] = new Array(total);
    const inFlight = new Set<Promise<void>>();
    let uploaded = 0;
    let firstError: unknown = null;

    for (let n = 1; n <= total && !firstError; n++) {
      opts.onStatus?.(`Đang tạo ảnh trang ${n}/${total}...`);
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(3, TARGET_WIDTH / base.width);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Trình duyệt không hỗ trợ canvas.");
      await page.render({ canvasContext: context, viewport }).promise;
      const blob = await canvasToBlob(canvas);
      const width = canvas.width;
      const height = canvas.height;
      canvas.width = 0;
      page.cleanup();

      const extension = blob.type === "image/jpeg" ? "jpg" : "webp";
      const file = new File([blob], `thang-${opts.month}-trang-${n}.${extension}`, { type: blob.type });
      const task = uploadMediaFile(file, {
        tag: MONTHLY_SOURCING_PAGE_TAG,
        alt_text: `Tháng ${opts.month} - trang ${n}`,
      })
        .then((media) => {
          refs[n - 1] = { page_no: n, media_id: media.id, width, height };
          opts.onStatus?.(`Đã tải ảnh trang ${++uploaded}/${total}`);
        })
        .catch((error) => {
          firstError ??= error;
        })
        .finally(() => inFlight.delete(task));
      inFlight.add(task);
      if (inFlight.size >= UPLOAD_CONCURRENCY) await Promise.race(inFlight);
    }
    await Promise.all(inFlight);
    if (firstError) throw firstError;
    return refs;
  } finally {
    await doc.destroy().catch(() => undefined);
  }
}
