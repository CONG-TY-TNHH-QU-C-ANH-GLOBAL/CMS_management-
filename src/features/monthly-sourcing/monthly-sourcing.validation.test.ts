import { describe, expect, test } from "bun:test";

import { hasPdfSignature, monthlySourcingPdfProblem } from "./monthly-sourcing.validation";

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
