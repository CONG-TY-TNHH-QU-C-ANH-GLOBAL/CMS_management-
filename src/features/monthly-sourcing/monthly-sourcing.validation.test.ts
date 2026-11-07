import { describe, expect, test } from "bun:test";

import { hasPdfSignature, monthlySourcingPdfProblem } from "./monthly-sourcing.validation";

describe("monthly sourcing PDF publishing", () => {
  test("accepts a ready PDF and rejects every other stored media state", () => {
    expect(monthlySourcingPdfProblem({ mime: "application/pdf", status: "ready" })).toBeNull();
    expect(monthlySourcingPdfProblem(null)).toContain("PDF");
    expect(monthlySourcingPdfProblem({ mime: "image/png", status: "ready" })).toContain("PDF");
    expect(monthlySourcingPdfProblem({ mime: "application/pdf", status: "archived" })).toContain(
      "sẵn sàng",
    );
  });

  test("does not trust MIME parameters or a misleading file name", () => {
    expect(
      monthlySourcingPdfProblem({ mime: "application/pdf; charset=binary", status: "ready" }),
    ).toContain("PDF");
    expect(
      monthlySourcingPdfProblem({ mime: "application/octet-stream", status: "ready" }),
    ).toContain("PDF");
  });

  test("recognizes the required %PDF- file signature before storage", () => {
    const encoder = new TextEncoder();
    expect(hasPdfSignature(encoder.encode("%PDF-1.7\nbody").buffer)).toBe(true);
    expect(hasPdfSignature(encoder.encode("not a PDF").buffer)).toBe(false);
    expect(hasPdfSignature(encoder.encode("%PDF").buffer)).toBe(false);
  });
});
