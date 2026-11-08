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

  test("renders the PDF as a single-page slide deck with previous and next controls", () => {
    const html = renderMonthlySourcingPage({
      year: 2026,
      month: 1,
      title: "Monthly source",
      pdfUrl: "https://cms.test/api/v1/media/monthly-sourcing%2Fjan.pdf",
    });

    expect(html).toContain('id="monthly-pdf-canvas"');
    expect(html).toContain('data-pdf-previous');
    expect(html).toContain('data-pdf-next');
    expect(html).toContain('data-pdf-page-count');
    expect(html).not.toContain("<iframe");
  });
});

describe("monthly sourcing page images", () => {
  const pages = [
    { url: "https://cms.test/api/v1/media/monthly-sourcing-page%2Fa-1.webp", width: 1200, height: 1697 },
    { url: "https://cms.test/api/v1/media/monthly-sourcing-page%2Fa-2.webp", width: 1200, height: 1697 },
  ];
  const render = () =>
    renderMonthlySourcingPage({
      year: 2026,
      month: 10,
      title: "Monthly source",
      pdfUrl: "https://cms.test/api/v1/media/monthly-sourcing%2Foct.pdf",
      pages,
    });

  test("shows page 1 as a preloaded image instead of downloading the PDF", () => {
    const html = render();
    expect(html).toContain('<link rel="preload" as="image" href="https://cms.test/api/v1/media/monthly-sourcing-page%2Fa-1.webp"');
    expect(html).toContain('id="monthly-page-image"');
    expect(html).toContain('width="1200" height="1697"');
    expect(html).toContain("Trang 1 / 2");
    expect(html).not.toContain("pdfjs-dist");
    expect(html).not.toContain('id="monthly-pdf-canvas"');
    // The download link to the original PDF stays available.
    expect(html).toContain('href="https://cms.test/api/v1/media/monthly-sourcing%2Foct.pdf"');
  });

  test("falls back to the PDF viewer when no page images exist", () => {
    const html = renderMonthlySourcingPage({
      year: 2026,
      month: 10,
      title: "Monthly source",
      pdfUrl: "https://cms.test/api/v1/media/monthly-sourcing%2Foct.pdf",
      pages: [],
    });
    expect(html).toContain('id="monthly-pdf-canvas"');
    expect(html).not.toContain("monthly-page-image");
  });

  test("refuses a non-web page image URL", () => {
    expect(() =>
      renderMonthlySourcingPage({
        year: 2026,
        month: 10,
        title: "x",
        pdfUrl: "https://cms.test/a.pdf",
        pages: [{ url: "javascript:alert(1)", width: 10, height: 10 }],
      }),
    ).toThrow("PDF URL must use HTTP or HTTPS.");
  });
});
