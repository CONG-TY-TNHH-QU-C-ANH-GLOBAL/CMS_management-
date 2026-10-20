import { expect, test } from "bun:test";
import { evaluateArticleSeo, type ArticleSeoInput } from "./article-seo";

const input: ArticleSeoInput = {
  title: "Kho Mỹ",
  slug: "kho-my",
  markdown: "",
  focusKeyword: "kho Mỹ",
};
const check = (value: ArticleSeoInput, id: string) =>
  evaluateArticleSeo(value).checks.find((c) => c.id === id)!;
test("Vietnamese phrases preserve accents, normalize Unicode, and match a slug without accents", () => {
  const result = evaluateArticleSeo({
    ...input,
    markdown: "**KHO** Mỹ. kho my. kho Mỹx. xkho Mỹ.",
    seoTitle: "Kho Mỹ: hướng dẫn",
    description: "Kho Mỹ giúp seller",
  });
  expect(result.keyword.count).toBe(1);
  for (const id of [
    "keyword-title",
    "keyword-description",
    "keyword-url",
    "keyword-intro",
    "keyword-title-start",
  ])
    expect(result.checks.find((c) => c.id === id)?.passed).toBe(true);
  expect(check({ ...input, slug: "xxkho-myy" }, "keyword-url").passed).toBe(false);
});
test("density is phrase occurrences divided by visible word count, not keyword word count", () => {
  const result = evaluateArticleSeo({ ...input, markdown: "kho Mỹ " + "hàng ".repeat(98) });
  expect(result.wordCount).toBe(100);
  expect(result.keyword).toEqual({ value: "kho mỹ", count: 1, density: 1, firstWord: 1 });
  expect(result.checks.find((c) => c.id === "density")?.status).toBe("pass");
});
for (const [count, status, points] of [
  [0, "fail", 0],
  [1, "pass", 6],
  [2, "warning", 3],
  [3, "fail", 0],
] as const) {
  test(`density at ${count}% reports ${status}`, () => {
    const result = check(
      {
        ...input,
        focusKeyword: "ship",
        markdown: "ship ".repeat(count) + "cargo ".repeat(100 - count),
      },
      "density",
    );
    expect(result.status).toBe(status);
    expect(result.points).toBe(points);
  });
}
test("URLs, alt text, HTML attributes and code cannot inflate density", () => {
  const result = evaluateArticleSeo({
    ...input,
    focusKeyword: "ship",
    markdown:
      'shipping [Guide](https://thgfulfill.com/ship) ![ship](/ship.png) `ship`\n\n```md\n## ship\n```\n\n<span data-keyword="ship"></span>',
  });
  expect(result.keyword.count).toBe(0);
  expect(result.checks.find((c) => c.id === "keyword-alt")?.passed).toBe(true);
  expect(result.checks.find((c) => c.id === "keyword-heading")?.passed).toBe(false);
  expect(
    evaluateArticleSeo({ ...input, focusKeyword: "fulfillment", markdown: "fulfill`ignored`ment" })
      .keyword.count,
  ).toBe(0);
});
test("punctuation in a keyword stays literal", () => {
  expect(
    evaluateArticleSeo({ ...input, focusKeyword: "C++", markdown: "C++ C C++" }).keyword.count,
  ).toBe(2);
  expect(
    evaluateArticleSeo({ ...input, focusKeyword: "(a+)+", markdown: "aaaaaaaaaaaa" }).keyword.count,
  ).toBe(0);
});
test("short-post exception and 10% opening boundary follow the documented rule", () => {
  expect(
    check({ ...input, markdown: "hàng ".repeat(280) + "kho Mỹ" }, "keyword-intro").passed,
  ).toBe(true);
  expect(
    check(
      { ...input, markdown: "hàng ".repeat(20) + "kho Mỹ " + "hàng ".repeat(278) },
      "keyword-intro",
    ).passed,
  ).toBe(true);
  expect(
    check(
      { ...input, markdown: "hàng ".repeat(40) + "kho Mỹ " + "hàng ".repeat(258) },
      "keyword-intro",
    ).passed,
  ).toBe(false);
});
test("position and metadata checks use the SEO override and its first 160 characters", () => {
  const value = {
    ...input,
    seoTitle: "Hướng dẫn seller vận hành kho Mỹ",
    description: "x".repeat(160) + " kho Mỹ",
    markdown: "## kho Mỹ",
  };
  expect(check(value, "keyword-title").passed).toBe(true);
  expect(check(value, "keyword-title-start").passed).toBe(false);
  expect(check(value, "keyword-description").passed).toBe(false);
  expect(check({ ...value, seoTitle: "Không có từ khóa" }, "keyword-title").passed).toBe(false);
});
for (const [count, points] of [
  [599, 0],
  [600, 1.6],
  [1000, 3.2],
  [1500, 4.8],
  [2000, 5.6],
  [2500, 5.6],
  [2501, 8],
]) {
  test(`content length ${count} receives ${points}/8`, () => {
    expect(check({ ...input, markdown: "hàng ".repeat(count) }, "body").points).toBeCloseTo(points);
  });
}
test("empty keyword cannot pass keyword tests and empty text never returns NaN", () => {
  const result = evaluateArticleSeo({ ...input, focusKeyword: "  " });
  expect(result.keyword.density).toBe(0);
  expect(result.keyword.firstWord).toBeNull();
  expect(
    result.checks
      .filter((c) => c.id.startsWith("keyword-") || ["focus", "density"].includes(c.id))
      .every((c) => !c.passed),
  ).toBe(true);
});
