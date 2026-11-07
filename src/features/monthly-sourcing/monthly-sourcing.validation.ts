export interface MonthlySourcingPdfMedia {
  mime: string;
  status: string;
}

/** A live monthly source must point at a public, ready PDF. */
export function monthlySourcingPdfProblem(media: MonthlySourcingPdfMedia | null): string | null {
  if (!media || media.mime !== "application/pdf") {
    return "Cần chọn một tệp PDF trước khi xuất bản.";
  }
  if (media.status !== "ready") {
    return "Tệp PDF chưa sẵn sàng để xuất bản.";
  }
  return null;
}
