import { describe, expect, test } from "bun:test";

import { toPublicDetail, toPublicSummary, toExcerpt } from "./community.mappers";
import { assertExpertAnswerInvariant, isIndexable } from "./community.policy";
import { pickAvailableSlug, slugify } from "./community.slug";
import type { CommunityQuestionJoinedRow } from "./community.service";

describe("community.policy isIndexable", () => {
  const base = { status: "published", verified: 1, expert_answer: "answer" };
  test("published + verified + answer → indexable", () => {
    expect(isIndexable(base)).toBe(true);
  });
  test("missing any leg → not indexable", () => {
    expect(isIndexable({ ...base, status: "pending" })).toBe(false);
    expect(isIndexable({ ...base, verified: 0 })).toBe(false);
    expect(isIndexable({ ...base, expert_answer: null })).toBe(false);
    expect(isIndexable({ ...base, expert_answer: "   " })).toBe(false);
  });
});

describe("community.policy assertExpertAnswerInvariant", () => {
  test("verified without answer throws", () => {
    expect(() => assertExpertAnswerInvariant(null, true)).toThrow();
    expect(() => assertExpertAnswerInvariant("  ", true)).toThrow();
  });
  test("valid combinations pass", () => {
    expect(() => assertExpertAnswerInvariant("answer", true)).not.toThrow();
    expect(() => assertExpertAnswerInvariant(null, false)).not.toThrow();
  });
});

describe("community.slug", () => {
  test("slugify strips Vietnamese diacritics", () => {
    expect(slugify("Ship VN sang Mỹ mất bao lâu, đắt không?")).toBe(
      "ship-vn-sang-my-mat-bao-lau-dat-khong",
    );
  });
  test("slugify never returns empty", () => {
    expect(slugify("???")).toBe("cau-hoi");
    expect(slugify("")).toBe("cau-hoi");
  });
  test("slugify collapses separator runs and trims edges", () => {
    expect(slugify("  a --  b__c  ")).toBe("a-b-c");
    expect(slugify("!!!abc???")).toBe("abc");
  });
  test("slugify caps at 80 chars without trailing dash", () => {
    const long = slugify(`${"x".repeat(79)} y z`);
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long.endsWith("-")).toBe(false);
    expect(slugify("x".repeat(200))).toHaveLength(80);
  });
  test("pickAvailableSlug suffixes on collision", () => {
    expect(pickAvailableSlug("a", new Set())).toBe("a");
    expect(pickAvailableSlug("a", new Set(["a"]))).toBe("a-2");
    expect(pickAvailableSlug("a", new Set(["a", "a-2"]))).toBe("a-3");
  });
});

describe("community.mappers privacy boundary", () => {
  const row: CommunityQuestionJoinedRow = {
    id: 1,
    slug: "q",
    title: "t",
    body: "b",
    category_id: null,
    category_slug: null,
    category_name: null,
    author_name: "Seller",
    author_email: "private@example.com",
    locale: "vi",
    ip: "1.2.3.4",
    user_agent: "UA",
    utm_json: '{"utm_source":"x"}',
    status: "published",
    expert_answer: "a",
    expert_answer_updated_at: 1,
    verified: 1,
    same_issue_count: 0,
    created_at: 1,
    updated_at: 1,
    published_at: 1,
  };
  const PRIVATE_FIELDS = ["author_email", "ip", "user_agent", "utm_json"];

  test("summary and detail never expose private fields", () => {
    for (const mapped of [toPublicSummary(row), toPublicDetail(row)]) {
      for (const field of PRIVATE_FIELDS) {
        expect(Object.keys(mapped)).not.toContain(field);
      }
    }
  });
  test("excerpt collapses whitespace and truncates at 200", () => {
    expect(toExcerpt("a  \n b")).toBe("a b");
    expect(toExcerpt("x".repeat(300))).toHaveLength(201); // 200 + ellipsis
  });
});
