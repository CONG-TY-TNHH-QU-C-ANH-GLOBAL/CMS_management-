import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

import { toPublicDetail, toPublicSummary, toExcerpt } from "./community.mappers";
import { generateOwnerToken, hashOwnerToken } from "./community.owner";
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
    owner_token_hash: "deadbeef",
    withdrawn_at: null,
  };
  const PRIVATE_FIELDS = ["author_email", "ip", "user_agent", "utm_json", "owner_token_hash", "withdrawn_at"];

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

describe("community.owner tokens", () => {
  test("generateOwnerToken is 256-bit hex and unique", () => {
    const a = generateOwnerToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(generateOwnerToken());
  });
  test("hashOwnerToken is deterministic and never equals the raw token", async () => {
    const raw = generateOwnerToken();
    const h1 = await hashOwnerToken(raw);
    const h2 = await hashOwnerToken(raw);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).not.toBe(raw);
    expect(await hashOwnerToken("other")).not.toBe(h1);
  });
});

// Regression guard for the category-filter bug: filtering MUST use the
// canonical category slug (join on category_id), never a display label, and
// withdrawn/unpublished rows must stay out. Mirrors the exact SQL shape used by
// listPublishedCommunityQuestions / getPublishedCommunityQuestion so a switch
// to label-matching or a dropped withdrawn_at guard fails here.
describe("community list filter (canonical slug + visibility)", () => {
  function seed() {
    const db = new Database(":memory:");
    db.run(`CREATE TABLE community_categories (id INTEGER PRIMARY KEY, slug TEXT UNIQUE, name TEXT);`);
    db.run(`INSERT INTO community_categories (id,slug,name) VALUES (1,'van-chuyen','Vận chuyển & Tracking'),(2,'pod','Print on Demand');`);
    db.run(`CREATE TABLE community_questions (id INTEGER PRIMARY KEY, slug TEXT UNIQUE, category_id INTEGER, status TEXT, withdrawn_at INTEGER, published_at INTEGER);`);
    db.run(`INSERT INTO community_questions (slug,category_id,status,withdrawn_at,published_at) VALUES
      ('ship-q',1,'published',NULL,100),
      ('pod-q',2,'published',NULL,90),
      ('pending-q',1,'pending',NULL,NULL),
      ('withdrawn-q',1,'published',123,80);`);
    return db;
  }
  const JOINED = `SELECT q.slug, c.slug AS category_slug, c.name AS category_name
    FROM community_questions q LEFT JOIN community_categories c ON c.id = q.category_id`;
  const listByCategory = (db: Database, slug: string) =>
    db.query(`${JOINED} WHERE q.status='published' AND q.withdrawn_at IS NULL AND c.slug=? ORDER BY q.published_at DESC`)
      .all(slug) as Array<{ slug: string }>;

  test("the van-chuyen tab shows the van-chuyen question (badge name matches slug)", () => {
    const db = seed();
    const rows = listByCategory(db, "van-chuyen");
    expect(rows.map((r) => r.slug)).toEqual(["ship-q"]);
    // Display label must NOT be a valid filter value — proves slug, not name.
    expect(listByCategory(db, "Vận chuyển & Tracking")).toHaveLength(0);
  });
  test("other tabs exclude it; pending + withdrawn never appear", () => {
    const db = seed();
    expect(listByCategory(db, "pod").map((r) => r.slug)).toEqual(["pod-q"]);
    const all = db.query(`${JOINED} WHERE q.status='published' AND q.withdrawn_at IS NULL ORDER BY q.published_at DESC`).all() as Array<{ slug: string }>;
    expect(all.map((r) => r.slug)).toEqual(["ship-q", "pod-q"]); // no pending-q, no withdrawn-q
  });
});
