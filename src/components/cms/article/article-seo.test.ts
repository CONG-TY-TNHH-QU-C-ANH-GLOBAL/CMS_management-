import { expect, test } from "bun:test";
import { evaluateArticleSeo, type ArticleSeoInput } from "./article-seo";

const full: ArticleSeoInput = {
  title: "Fulfillment Mỹ và quy trình vận hành kho",
  seoTitle: "Fulfillment Mỹ và quy trình vận hành kho",
  focusKeyword: "fulfillment",
  description:
    "Hướng dẫn cho seller cách chọn kho fulfillment tại Mỹ, chuẩn bị hàng và theo dõi quá trình tiếp nhận, xử lý đơn hàng.",
  slug: "fulfillment-my",
  hasCover: true,
  markdown: `## Chọn kho fulfillment\n\n${("fulfillment " + "hàng ".repeat(79)).repeat(35)}\n\n### Chi phí\n\n[THG](/vi/thg-warehouse)\n\n![Kho fulfillment Mỹ](https://example.com/a.jpg)`,
};
test("complete article receives 100 and weights total 100", () => {
  const result = evaluateArticleSeo(full);
  expect(result.score).toBe(100);
  expect(result.checks.reduce((sum, c) => sum + c.weight, 0)).toBe(100);
});
test("unsaved changes lose description, keyword-description, alt and cover points", () => {
  const result = evaluateArticleSeo({ ...full, description: "", imageAlts: [""], hasCover: false });
  expect(result.score).toBe(82);
  expect(result.checks.filter((c) => !c.passed).map((c) => c.id)).toEqual([
    "keyword-description",
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
test("segments Chinese text and reports excessive exact-phrase repetition in an event", () => {
  const result = evaluateArticleSeo({
    ...full,
    locale: "zh",
    kind: "event",
    focusKeyword: "仓储",
    markdown: `## 活动\n\n${"我们提供仓储物流服务。".repeat(50)}`,
  });
  expect(result.wordCount).toBeGreaterThan(100);
  expect(result.keyword.count).toBe(50);
  expect(result.checks.find((c) => c.id === "density")?.status).toBe("fail");
});
test("unfinished Markdown links stay editable and titled links still count", () => {
  const unfinished = "[unfinished ".repeat(4000);
  expect(
    evaluateArticleSeo({ ...full, markdown: unfinished }).checks.find((c) => c.id === "links")
      ?.passed,
  ).toBe(false);
  expect(
    evaluateArticleSeo({ ...full, markdown: `${unfinished}\n[THG](/vi "Trang chủ")` }).checks.find(
      (c) => c.id === "links",
    )?.passed,
  ).toBe(true);
});
