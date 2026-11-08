import { describe, expect, test } from "bun:test";

import { hasPdfEofMarker, hasPdfSignature, maxUploadBytes, monthlySourcingPdfProblem } from "./monthly-sourcing.validation";

describe("monthly sourcing PDF publishing", () => {
  test("accepts a ready PDF and rejects every other stored media state", () => {
    expect(
      monthlySourcingPdfProblem({
        mime: "application/pdf",
        status: "ready",
        monthly_pdf_verified: 1,
      }),
    ).toBeNull();
    expect(monthlySourcingPdfProblem(null)).toContain("PDF");
    expect(
      monthlySourcingPdfProblem({ mime: "image/png", status: "ready", monthly_pdf_verified: 1 }),
    ).toContain("PDF");
    expect(
      monthlySourcingPdfProblem({
        mime: "application/pdf",
        status: "archived",
        monthly_pdf_verified: 1,
      }),
    ).toContain("sẵn sàng");
    expect(
      monthlySourcingPdfProblem({
        mime: "application/pdf",
        status: "ready",
        monthly_pdf_verified: 0,
      }),
    ).toContain("xác thực");
  });

  test("does not trust MIME parameters or a misleading file name", () => {
    expect(
      monthlySourcingPdfProblem({
        mime: "application/pdf; charset=binary",
        status: "ready",
        monthly_pdf_verified: 1,
      }),
    ).toContain("PDF");
    expect(
      monthlySourcingPdfProblem({
        mime: "application/octet-stream",
        status: "ready",
        monthly_pdf_verified: 1,
      }),
    ).toContain("PDF");
  });

  test("recognizes the required %PDF- file signature before storage", () => {
    const encoder = new TextEncoder();
    expect(hasPdfSignature(encoder.encode("%PDF-1.7\nbody").buffer)).toBe(true);
    expect(hasPdfSignature(encoder.encode("not a PDF").buffer)).toBe(false);
    expect(hasPdfSignature(encoder.encode("%PDF").buffer)).toBe(false);
  });
});

describe("upload size cap", () => {
  test("monthly sourcing PDFs may exceed 10 MB (22 MB deck), other uploads may not", () => {
    expect(maxUploadBytes("monthly-sourcing")).toBeGreaterThan(22 * 1024 * 1024);
    expect(maxUploadBytes(null)).toBe(10 * 1024 * 1024);
    expect(maxUploadBytes("blog")).toBe(10 * 1024 * 1024);
  });
});

describe("PDF truncation check", () => {
  const bytes = (text: string) => new TextEncoder().encode(text);
  test("accepts a tail ending in %%EOF, with trailing newline padding", () => {
    expect(hasPdfEofMarker(bytes("startxref\n123\n%%EOF\n"))).toBe(true);
    expect(hasPdfEofMarker(bytes("x".repeat(500) + "%%EOF\r\n\n"))).toBe(true);
  });
  test("rejects a file cut mid-stream", () => {
    expect(hasPdfEofMarker(bytes("endobj\n1075 0 obj\n<<"))).toBe(false);
    expect(hasPdfEofMarker(new Uint8Array())).toBe(false);
  });
});
