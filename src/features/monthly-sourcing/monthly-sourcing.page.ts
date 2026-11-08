import { renderStandardHeader } from "@/features/campaigns/landing/landing.header";
import { leadScriptTag } from "@/features/campaigns/landing/landing.normalize";

import { monthlySourcingSlug } from "./monthly-sourcing.pure";

export interface MonthlySourcingLandingPage {
  year: number;
  month: number;
  title: string;
  pdfUrl: string;
  /** Pre-rendered page images. When present they replace the PDF viewer, so page 1 shows at once. */
  pages?: { url: string; width: number; height: number }[];
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function safePdfUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("PDF URL must use HTTP or HTTPS.");
  }
  return url.href;
}

/** Fixed LP page: CMS supplies only the month title and its uploaded PDF. */
function renderPageImageViewer(pages: { url: string; width: number; height: number }[]): {
  head: string;
  body: string;
} {
  const safe = pages.map((page) => ({
    url: safePdfUrl(page.url),
    width: Math.max(1, Math.floor(page.width)),
    height: Math.max(1, Math.floor(page.height)),
  }));
  const first = safe[0]!;
  const data = JSON.stringify(safe.map((page) => page.url)).replace(/</g, "\\u003c");
  return {
    // Start fetching page 1 while the HTML is still being parsed.
    head: `<link rel="preload" as="image" href="${escapeHtml(first.url)}" fetchpriority="high">`,
    body: `<section class="monthly-source__pdf monthly-source__pdf--images" aria-label="Tài liệu" aria-roledescription="carousel">
        <button class="monthly-source__slide-control monthly-source__slide-control--previous" type="button" data-pdf-previous aria-label="Trang trước">‹</button>
        <img id="monthly-page-image" class="monthly-source__page-image" src="${escapeHtml(first.url)}" width="${first.width}" height="${first.height}" alt="Trang 1" fetchpriority="high" decoding="async">
        <button class="monthly-source__slide-control monthly-source__slide-control--next" type="button" data-pdf-next aria-label="Trang sau">›</button>
        <output class="monthly-source__page-count" data-pdf-page-count>Trang 1 / ${safe.length}</output>
      </section>
      <script>
        (function () {
          var pages = ${data}, index = 0;
          var img = document.getElementById("monthly-page-image"), count = document.querySelector("[data-pdf-page-count]");
          var prev = document.querySelector("[data-pdf-previous]"), next = document.querySelector("[data-pdf-next]");
          var warmed = {};
          function warm(i) { if (i >= 0 && i < pages.length && !warmed[i]) { warmed[i] = true; var p = new Image(); p.decoding = "async"; p.src = pages[i]; } }
          function show(i) {
            if (i < 0 || i >= pages.length) return;
            index = i; img.src = pages[i]; img.alt = "Trang " + (i + 1);
            count.textContent = "Trang " + (i + 1) + " / " + pages.length;
            prev.disabled = i === 0; next.disabled = i === pages.length - 1;
            warm(i + 1); warm(i + 2); warm(i - 1);
          }
          prev.addEventListener("click", function () { show(index - 1); });
          next.addEventListener("click", function () { show(index + 1); });
          document.addEventListener("keydown", function (e) { if (e.key === "ArrowRight") show(index + 1); if (e.key === "ArrowLeft") show(index - 1); });
          var startX = null;
          img.addEventListener("touchstart", function (e) { startX = e.touches[0].clientX; }, { passive: true });
          img.addEventListener("touchend", function (e) { if (startX === null) return; var dx = e.changedTouches[0].clientX - startX; startX = null; if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1)); }, { passive: true });
          prev.disabled = true; next.disabled = pages.length < 2;
          warm(1); warm(2);
        })();
      </script>`,
  };
}

export function renderMonthlySourcingPage(input: MonthlySourcingLandingPage): string {
  const slug = monthlySourcingSlug(input.year, input.month);
  const title = escapeHtml(
    input.title.trim() || `Top sản phẩm & nguồn hàng tháng ${input.month}/${input.year}`,
  );
  const pdfUrl = escapeHtml(safePdfUrl(input.pdfUrl));
  const images = input.pages && input.pages.length > 0 ? renderPageImageViewer(input.pages) : null;

  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title} | TH Group</title>
    ${leadScriptTag(slug, "vi")}
    ${images?.head ?? ""}
    <style>
      body { margin: 0; background: #faf8f5; color: #172033; font-family: "Be Vietnam Pro", system-ui, sans-serif; }
      .monthly-source { width: min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 48px 0 72px; }
      .monthly-source__eyebrow { margin: 0 0 10px; color: #8a6739; font-size: 13px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
      .monthly-source__title { margin: 0; max-width: 760px; font-size: clamp(30px, 4vw, 48px); line-height: 1.16; }
      .monthly-source__lead { max-width: 700px; margin: 16px 0 0; color: #586174; line-height: 1.7; }
      .monthly-source__actions { display: flex; flex-wrap: wrap; gap: 12px; margin: 28px 0; }
      .monthly-source__button { display: inline-flex; align-items: center; justify-content: center; min-height: 46px; padding: 0 20px; border: 0; border-radius: 999px; background: #8a6739; color: #fff; font: inherit; font-weight: 700; cursor: pointer; text-decoration: none; }
      .monthly-source__button--secondary { border: 1px solid #d8d3c8; background: #fff; color: #172033; }
      .monthly-source__pdf { position: relative; overflow: hidden; min-height: 40vh; border: 1px solid #e2ddd4; border-radius: 20px; background: #fff; box-shadow: 0 24px 64px -36px rgba(23, 32, 51, .35); }
      .monthly-source__pdf canvas { display: block; width: 100%; height: auto; margin: 0 auto; }
      .monthly-source__pdf--images { min-height: 0; display: flex; justify-content: center; background: #fff; }
      .monthly-source__page-image { display: block; width: 100%; max-width: 880px; height: auto; }
      .monthly-source__slide-control { position: absolute; top: 50%; z-index: 1; width: 48px; height: 48px; border: 0; border-radius: 999px; background: #8a6739; color: #fff; font-size: 28px; cursor: pointer; transform: translateY(-50%); }
      .monthly-source__slide-control:disabled { opacity: .35; cursor: default; } .monthly-source__slide-control--previous { left: 16px; } .monthly-source__slide-control--next { right: 16px; }
      .monthly-source__page-count { position: absolute; bottom: 14px; left: 50%; padding: 6px 10px; border-radius: 999px; background: rgba(23,32,51,.75); color:#fff; font-size: 13px; transform: translateX(-50%); }
      .monthly-source__fallback { padding: 24px; color: #586174; }
      @media (max-width: 640px) { .monthly-source { width: min(100% - 24px, 1180px); padding-top: 28px; } .monthly-source__pdf, .monthly-source__pdf iframe { min-height: 60vh; } }
    </style>
  </head>
  <body>
    ${renderStandardHeader("vi")}
    <main class="monthly-source">
      <p class="monthly-source__eyebrow">Top sản phẩm &amp; nguồn hàng</p>
      <h1 class="monthly-source__title">${title}</h1>
      <p class="monthly-source__lead">Xem tài liệu sản phẩm và nguồn hàng được TH Group cập nhật cho tháng này.</p>
      <div class="monthly-source__actions">
        <a class="monthly-source__button" href="${pdfUrl}" target="_blank" rel="noopener noreferrer">Mở / tải PDF</a>
        <button class="monthly-source__button monthly-source__button--secondary" type="button" data-consult>Nhận tư vấn</button>
      </div>
      ${images ? images.body : `      <section class="monthly-source__pdf" aria-label="Tài liệu PDF">
        <button class="monthly-source__slide-control monthly-source__slide-control--previous" type="button" data-pdf-previous aria-label="Trang trước">‹</button>
        <canvas id="monthly-pdf-canvas" aria-label="Trang PDF hiện tại"></canvas>
        <button class="monthly-source__slide-control monthly-source__slide-control--next" type="button" data-pdf-next aria-label="Trang sau">›</button>
        <output class="monthly-source__page-count" data-pdf-page-count>Đang tải…</output>
      </section>
      <script type="module">
        import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
        const canvas = document.querySelector("#monthly-pdf-canvas"), previous = document.querySelector("[data-pdf-previous]"), next = document.querySelector("[data-pdf-next]"), count = document.querySelector("[data-pdf-page-count]");
        let pdf, page = 1, rendering = false;
        const render = async () => { if (!pdf || rendering) return; rendering = true; const current = await pdf.getPage(page); const base = current.getViewport({ scale: 1 }); const maxWidth = base.height > base.width ? 880 : 1180; const shown = Math.min(canvas.parentElement.clientWidth || maxWidth, maxWidth); canvas.style.maxWidth = shown + "px"; const viewport = current.getViewport({ scale: (shown / base.width) * Math.min(window.devicePixelRatio || 1, 2) }); canvas.width = viewport.width; canvas.height = viewport.height; await current.render({ canvasContext: canvas.getContext("2d"), viewport }).promise; count.textContent = "Trang " + page + " / " + pdf.numPages; previous.disabled = page === 1; next.disabled = page === pdf.numPages; rendering = false; };
        previous.addEventListener("click", () => { if (page > 1) { page--; render(); } }); next.addEventListener("click", () => { if (pdf && page < pdf.numPages) { page++; render(); } });
        pdfjsLib.getDocument("${pdfUrl}").promise.then((document) => { pdf = document; render(); }).catch(() => { count.textContent = "Không thể tải PDF"; });
      </script>
`}
    </main>
  </body>
</html>`;
}
