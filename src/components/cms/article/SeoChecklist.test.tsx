import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SeoChecklist } from "./SeoChecklist";

test("checklist displays real density and first position, outcome counts and source limits", () => {
  const html = renderToStaticMarkup(
    <SeoChecklist
      title="Kho Mỹ"
      slug="kho-my"
      focusKeyword="kho Mỹ"
      markdown={"kho Mỹ " + "hàng ".repeat(98)}
    />,
  );
  expect(html).toContain("1.00%");
  expect(html).toContain("100 từ");
  expect(html).toContain("Xuất hiện đầu ở từ thứ 1");
  for (const label of [
    "Đạt",
    "Cảnh báo",
    "Chưa đạt",
    "không phải điểm của plugin Rank Math",
    "không chặn xuất bản",
  ])
    expect(html).toContain(label);
  expect(html).toContain('href="https://rankmath.com/kb/score-100-in-tests/"');
});
test("missing keyword prompts selection and untrusted keyword text is escaped", () => {
  const empty = renderToStaticMarkup(<SeoChecklist title="Bài" slug="bai" markdown="" />);
  expect(empty).toContain("Nhập từ khóa chính");
  const unsafe = renderToStaticMarkup(
    <SeoChecklist
      title="Bài"
      slug="bai"
      markdown=""
      focusKeyword={'<img src=x onerror="alert(1)">'}
    />,
  );
  expect(unsafe).not.toContain("<img src=x");
  expect(unsafe).toContain("&lt;img");
});
