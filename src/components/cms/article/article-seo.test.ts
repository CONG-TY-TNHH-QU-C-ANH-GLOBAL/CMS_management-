import { expect, test } from "bun:test";
import { evaluateArticleSeo, type ArticleSeoInput } from "./article-seo";

const full: ArticleSeoInput = {
  title: "Kho fulfillment Mỹ và quy trình vận hành",
  seoTitle: "Kho fulfillment Mỹ và quy trình vận hành",
  description:
    "Hướng dẫn cho seller cách chọn kho fulfillment tại Mỹ, chuẩn bị hàng và theo dõi quá trình tiếp nhận, xử lý đơn hàng.",
  slug: "kho-fulfillment-my",
  hasCover: true,
  markdown: `## Chọn kho\n\n${"Hàng hóa cần xử lý đầy đủ. ".repeat(65)}\n\n### Chi phí\n\n[THG](/vi/thg-warehouse)\n\n![Kho Mỹ](https://example.com/a.jpg)`,
};

test("complete article receives 100 and weights total 100", () => {
  const result = evaluateArticleSeo(full);
  expect(result.score).toBe(100);
  expect(result.checks.reduce((sum, c) => sum + c.weight, 0)).toBe(100);
});
test("unsaved changes lower the score and identify missing descriptions and image alt", () => {
  const result = evaluateArticleSeo({ ...full, description: "", imageAlts: [""], hasCover: false });
  expect(result.score).toBe(65);
  expect(result.checks.filter((c) => !c.passed).map((c) => c.id)).toEqual([
    "description",
    "alt",
    "cover",
  ]);
});
test("fake headings and links inside code do not pass structural checks", () => {
  const result = evaluateArticleSeo({
    ...full,
    markdown: "```markdown\n## Heading\n[THG](/vi)\n```\n~~~\n## Fake\n~~~\n`[THG](/vi)`",
  });
  for (const id of ["headings", "hierarchy", "links", "body"])
    expect(result.checks.find((c) => c.id === id)?.passed).toBe(false);
});
test("rejects an extra H1, skipped heading levels, and lookalike external domains", () => {
  const result = evaluateArticleSeo({
    ...full,
    markdown:
      "# Duplicate\n\n## Heading\n\n#### Jump\n\n[THG](https://thgfulfill.com.evil.test/vi)",
  });
  for (const id of ["h1", "hierarchy", "links"])
    expect(result.checks.find((c) => c.id === id)?.passed).toBe(false);
});
test("segments Chinese content and accepts the event length guidance", () => {
  const result = evaluateArticleSeo({
    ...full,
    locale: "zh",
    kind: "event",
    markdown: `## 活动\n\n${"我们提供仓储物流服务。".repeat(50)}`,
  });
  expect(result.checks.find((c) => c.id === "body")?.passed).toBe(true);
});
