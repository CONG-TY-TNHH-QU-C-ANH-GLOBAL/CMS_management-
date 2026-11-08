export const MONTHLY_SOURCING_MEDIA_TAG = "monthly-sourcing";

export interface MonthlySourcingPdfMedia {
  mime: string;
  status: string;
  monthly_pdf_verified: number;
}

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const PDF_HEADER_WINDOW = 1024;

/** PDF producers may leave a short binary preamble, but the required header
 * must still appear in the file's first kilobyte. Inspecting this bounded window
 * keeps the upload check cheap while rejecting a browser-controlled MIME lie. */
export const DEFAULT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
/** Monthly sourcing decks are image-heavy slide PDFs (~22 MB seen); the Worker holds the
 *  parsed form plus one ArrayBuffer copy (~2x) in its 128 MB heap, so cap well below that. */
export const MONTHLY_SOURCING_PDF_MAX_BYTES = 30 * 1024 * 1024;

/** Per-upload byte cap: monthly sourcing PDFs get the larger one, everything else 10 MB. */
export function maxUploadBytes(tag: string | null): number {
  return tag === MONTHLY_SOURCING_MEDIA_TAG ? MONTHLY_SOURCING_PDF_MAX_BYTES : DEFAULT_UPLOAD_MAX_BYTES;
}

export function hasPdfSignature(input: ArrayBufferLike | Uint8Array): boolean {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const lastStart = Math.min(bytes.length, PDF_HEADER_WINDOW) - PDF_SIGNATURE.length;
  for (let start = 0; start <= lastStart; start++) {
    if (PDF_SIGNATURE.every((byte, index) => bytes[start + index] === byte)) return true;
  }
  return false;
}

/** A live monthly source must point at a public, ready PDF. */
export function monthlySourcingPdfProblem(media: MonthlySourcingPdfMedia | null): string | null {
  if (!media || media.mime !== "application/pdf") {
    return "Cần chọn một tệp PDF trước khi xuất bản.";
  }
  if (media.status !== "ready") {
    return "Tệp PDF chưa sẵn sàng để xuất bản.";
  }
  if (media.monthly_pdf_verified !== 1) {
    return "Tệp PDF chưa được xác thực khi tải lên.";
  }
  return null;
}
