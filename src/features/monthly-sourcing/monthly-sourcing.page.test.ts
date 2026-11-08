import { describe, expect, test } from "bun:test";

import { renderMonthlySourcingPage } from "./monthly-sourcing.page";

describe("monthly sourcing fixed landing template", () => {
  test("escapes CMS-controlled prose before writing the fixed HTML page", () => {
    const html = renderMonthlySourcingPage({
      year: 2026,
      month: 1,
      title: '<img src=x onerror="alert(1)">',
      pdfUrl: "https://cms.test/api/v1/media/monthly-sourcing%2Fjan.pdf?download=1&x=2",
    });

    expect(html).not.toContain('<img src=x onerror="alert(1)">');
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("download=1&amp;x=2");
    expect(html).toContain('data-slug="thang-1-2026"');
  });

  test("refuses a non-web PDF URL instead of embedding it into the LP host", () => {
    expect(() =>
      renderMonthlySourcingPage({
        year: 2026,
        month: 1,
        title: "Monthly source",
        pdfUrl: "javascript:alert(1)",
      }),
    ).toThrow("PDF URL must use HTTP or HTTPS.");
  });
});
