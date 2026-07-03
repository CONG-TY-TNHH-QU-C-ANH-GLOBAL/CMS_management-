// Public wire-shape mappers — the ONLY place a community DB row becomes a
// client response. Privacy boundary: author_email, ip, user_agent and
// utm_json must never appear in any object built here (asserted by
// community.test.ts).

import { isIndexable } from "./community.policy";
import type { CommunityQuestionJoinedRow } from "./community.service";

export function toExcerpt(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > 200 ? flat.slice(0, 200) + "…" : flat;
}

function toCategoryRef(q: CommunityQuestionJoinedRow) {
  return q.category_slug && q.category_name
    ? { slug: q.category_slug, name: q.category_name }
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
