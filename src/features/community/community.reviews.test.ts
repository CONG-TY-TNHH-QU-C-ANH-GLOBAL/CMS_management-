import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

import { toPublicReviewDetail, toPublicReviewSummary } from "./community.mappers";
import { isReviewIndexable, MIN_INDEXABLE_REVIEW_BODY } from "./community.policy";
import type { CommunityReviewJoinedRow } from "./community.reviews.service";

const LONG_BODY = "x".repeat(MIN_INDEXABLE_REVIEW_BODY);

describe("community.policy isReviewIndexable", () => {
  const base = { status: "published", verified: 1, title: "t", body: LONG_BODY, withdrawn_at: null };
  test("published + verified + non-thin body → indexable", () => {
    expect(isReviewIndexable(base)).toBe(true);
  });
  test("missing any leg → not indexable", () => {
    expect(isReviewIndexable({ ...base, status: "pending" })).toBe(false);
    expect(isReviewIndexable({ ...base, verified: 0 })).toBe(false);
    expect(isReviewIndexable({ ...base, withdrawn_at: 123 })).toBe(false);
    expect(isReviewIndexable({ ...base, title: "   " })).toBe(false);
  });
  test("thin body stays out of SEO even once verified", () => {
    expect(isReviewIndexable({ ...base, body: "too short" })).toBe(false);
    expect(isReviewIndexable({ ...base, body: "y".repeat(MIN_INDEXABLE_REVIEW_BODY - 1) })).toBe(false);
  });
});

describe("community.mappers review privacy boundary", () => {
  const row: CommunityReviewJoinedRow = {
    id: 1,
    slug: "r",
    title: "Great fulfillment",
    body: LONG_BODY,
    category_id: null,
    category_slug: null,
    category_name: null,
    reviewer_name: "Seller",
    reviewer_email: "private@example.com",
    rating: 5,
    locale: "vi",
    ip: "1.2.3.4",
    user_agent: "UA",
    utm_json: '{"utm_source":"x"}',
    status: "published",
    verified: 1,
    public_summary: "Solid POD partner",
    private_evidence_note: "screenshot of tracking",
    private_order_reference: "ORD-12345",
    owner_token_hash: "deadbeef",
    withdrawn_at: null,
    created_at: 1,
    updated_at: 1,
    published_at: 1,
  };
  const PRIVATE_FIELDS = [
    "reviewer_email",
    "ip",
    "user_agent",
    "utm_json",
    "owner_token_hash",
    "private_evidence_note",
    "private_order_reference",
    "withdrawn_at",
  ];

  test("summary and detail never expose private fields", () => {
    for (const mapped of [toPublicReviewSummary(row), toPublicReviewDetail(row)]) {
      for (const field of PRIVATE_FIELDS) {
        expect(Object.keys(mapped)).not.toContain(field);
      }
    }
  });
  test("public projections keep the intended fields", () => {
    expect(toPublicReviewSummary(row).rating).toBe(5);
    expect(toPublicReviewDetail(row).public_summary).toBe("Solid POD partner");
    expect(toPublicReviewDetail(row).reviewer_name).toBe("Seller");
  });
});

// Mirrors the Q&A visibility guard: public list/detail MUST filter by canonical
// category slug and exclude pending/rejected/withdrawn rows. Mirrors the exact
// SQL shape used by listPublishedCommunityReviews / getPublishedCommunityReview.
describe("community reviews list filter (canonical slug + visibility)", () => {
  function seed() {
    const db = new Database(":memory:");
    db.run(`CREATE TABLE community_categories (id INTEGER PRIMARY KEY, slug TEXT UNIQUE, name TEXT);`);
    db.run(`INSERT INTO community_categories (id,slug,name) VALUES (1,'pod','Print on Demand'),(2,'dropship','Dropshipping');`);
    db.run(`CREATE TABLE community_reviews (id INTEGER PRIMARY KEY, slug TEXT UNIQUE, category_id INTEGER, status TEXT, withdrawn_at INTEGER, published_at INTEGER);`);
    db.run(`INSERT INTO community_reviews (slug,category_id,status,withdrawn_at,published_at) VALUES
      ('pod-good',1,'published',NULL,100),
      ('drop-good',2,'published',NULL,90),
      ('pending-r',1,'pending',NULL,NULL),
      ('withdrawn-r',1,'published',123,80);`);
    return db;
  }
  const JOINED = `SELECT r.slug, c.slug AS category_slug, c.name AS category_name
    FROM community_reviews r LEFT JOIN community_categories c ON c.id = r.category_id`;
  const listByCategory = (db: Database, slug: string) =>
    db.query(`${JOINED} WHERE r.status='published' AND r.withdrawn_at IS NULL AND c.slug=? ORDER BY r.published_at DESC`)
      .all(slug) as Array<{ slug: string }>;

  test("the pod tab shows the pod review (filters by slug, not display name)", () => {
    const db = seed();
    expect(listByCategory(db, "pod").map((r) => r.slug)).toEqual(["pod-good"]);
    expect(listByCategory(db, "Print on Demand")).toHaveLength(0);
  });
  test("pending + withdrawn reviews never appear publicly", () => {
    const db = seed();
    const all = db.query(`${JOINED} WHERE r.status='published' AND r.withdrawn_at IS NULL ORDER BY r.published_at DESC`).all() as Array<{ slug: string }>;
    expect(all.map((r) => r.slug)).toEqual(["pod-good", "drop-good"]); // no pending-r, no withdrawn-r
  });
});
