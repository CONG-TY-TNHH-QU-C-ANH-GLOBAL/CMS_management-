// Public wire-shape mappers — the ONLY place a community DB row becomes a
// client response. Privacy boundary: author_email, ip, user_agent and
// utm_json must never appear in any object built here (asserted by
// community.test.ts).

import { isIndexable, isReviewIndexable } from "./community.policy";
import type { CommunityReviewJoinedRow } from "./community.reviews.service";
import type { CommunityQuestionJoinedRow } from "./community.service";

export function toExcerpt(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > 200 ? flat.slice(0, 200) + "…" : flat;
}

/** Category ref is shared by questions and reviews (same joined columns). */
function toCategoryRef(row: { category_slug: string | null; category_name: string | null }) {
  return row.category_slug && row.category_name
    ? { slug: row.category_slug, name: row.category_name }
    : null;
}

/** List-item projection (matches communityQuestionSummarySchema). */
export function toPublicSummary(q: CommunityQuestionJoinedRow) {
  return {
    slug: q.slug,
    title: q.title,
    excerpt: toExcerpt(q.body),
    category: toCategoryRef(q),
    has_expert_answer: Boolean(q.expert_answer?.trim()),
    verified: q.verified === 1,
    indexable: isIndexable(q),
    same_issue_count: q.same_issue_count,
    published_at: q.published_at,
  };
}

/** Detail projection (matches communityQuestionDetailSchema). */
export function toPublicDetail(q: CommunityQuestionJoinedRow) {
  return {
    slug: q.slug,
    title: q.title,
    body: q.body,
    category: toCategoryRef(q),
    author_name: q.author_name,
    expert_answer: q.expert_answer,
    expert_answer_updated_at: q.expert_answer_updated_at,
    verified: q.verified === 1,
    indexable: isIndexable(q),
    same_issue_count: q.same_issue_count,
    published_at: q.published_at,
  };
}

// ─── Verified Reviews (Sprint 4) ───────────────────────────────────────────
// Same privacy boundary: reviewer_email, ip, user_agent, utm_json,
// owner_token_hash, private_evidence_note and private_order_reference must
// never appear in any object built here (asserted by community.reviews.test.ts).

/** List-item projection (matches communityReviewSummarySchema). */
export function toPublicReviewSummary(r: CommunityReviewJoinedRow) {
  return {
    slug: r.slug,
    title: r.title,
    excerpt: toExcerpt(r.body),
    category: toCategoryRef(r),
    rating: r.rating,
    verified: r.verified === 1,
    indexable: isReviewIndexable(r),
    published_at: r.published_at,
  };
}

/** Detail projection (matches communityReviewDetailSchema). */
export function toPublicReviewDetail(r: CommunityReviewJoinedRow) {
  return {
    slug: r.slug,
    title: r.title,
    body: r.body,
    category: toCategoryRef(r),
    reviewer_name: r.reviewer_name,
    rating: r.rating,
    public_summary: r.public_summary,
    verified: r.verified === 1,
    indexable: isReviewIndexable(r),
    published_at: r.published_at,
  };
}
