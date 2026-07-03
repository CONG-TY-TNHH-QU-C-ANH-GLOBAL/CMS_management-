// Community Hub service — seller Q&A (Sprint 1 MVP).
//
// Moderation-first: submissions land as status='pending' and only operators
// publish them. The indexing gate lives in community.policy.ts (published AND
// verified AND expert answer); landing derives its noindex rules from it.
//
// VI-canonical, not localized in MVP: questions are served as submitted.
// Expert answer is a column pair on the question row (one curated THG answer
// per question); a separate answers table is deferred until community-authored
// answers are in scope.

import { getDb } from "@/core/db/client";

import { assertExpertAnswerInvariant } from "./community.policy";
import {
  getPublishedJoinedBySlug,
  insertWithUniqueSlug,
  listAdminJoined,
  listPublishedJoined,
  prepareCommunitySubmission,
  setStatusById,
  withdrawOwnedBySlug,
} from "./community.repo";

export type CommunityQuestionStatus = "pending" | "published" | "rejected";
export type CommunityLocale = "en" | "vi" | "zh";

export interface CommunityCategoryRow {
  id: number;
  slug: string;
  name: string;
  position: number;
}

export interface CommunityQuestionRow {
  id: number;
  slug: string;
  title: string;
  body: string;
  category_id: number | null;
  author_name: string;
  author_email: string;
  locale: CommunityLocale | null;
  ip: string | null;
  user_agent: string | null;
  utm_json: string | null;
  status: CommunityQuestionStatus;
  expert_answer: string | null;
  expert_answer_updated_at: number | null;
  verified: number;
  same_issue_count: number;
  created_at: number;
  updated_at: number;
  published_at: number | null;
  // Ownership/withdrawal (migration 0036). owner_token_hash is admin/internal
  // only — never mapped to a public response. Withdrawn = withdrawn_at set.
  owner_token_hash: string | null;
  withdrawn_at: number | null;
}

/** Question row joined with its category (for both public + admin lists). */
export interface CommunityQuestionJoinedRow extends CommunityQuestionRow {
  category_slug: string | null;
  category_name: string | null;
}

export interface CreateCommunityQuestionInput {
  title: string;
  body: string;
  category_slug?: string | null;
  author_name: string;
  author_email: string;
  locale?: CommunityLocale | null;
  ip?: string | null;
  user_agent?: string | null;
  utm?: Record<string, string> | null;
}

export async function listCommunityCategories(): Promise<CommunityCategoryRow[]> {
  const result = await getDb()
    .prepare(`SELECT id, slug, name, position FROM community_categories ORDER BY position ASC, id ASC`)
    .all<CommunityCategoryRow>();
  return result.results ?? [];
}

export async function createCommunityQuestion(
  input: CreateCommunityQuestionInput,
): Promise<{ id: number; slug: string; ownerToken: string }> {
  const { categoryId, utmJson, ownerToken, ownerTokenHash } = await prepareCommunitySubmission(input);

  const { id, slug } = await insertWithUniqueSlug("community_questions", input.title, (s) =>
    getDb()
      .prepare(
        `INSERT INTO community_questions(
           slug, title, body, category_id, author_name, author_email,
           locale, ip, user_agent, utm_json, owner_token_hash, status, created_at, updated_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', unixepoch(), unixepoch())
         RETURNING id`,
      )
      .bind(
        s,
        input.title.trim(),
        input.body.trim(),
        categoryId,
        input.author_name.trim(),
        input.author_email.toLowerCase().trim(),
        input.locale ?? null,
        input.ip ?? null,
        input.user_agent ?? null,
        utmJson,
        ownerTokenHash,
      )
      .first<{ id: number }>(),
  );
  return { id, slug, ownerToken };
}

/** Soft-withdraw a question the caller owns (proves ownership via the raw
 *  token). Returns true only when the token matches an active (not already
 *  withdrawn) question. Callers must NOT distinguish "not found" from "wrong
 *  token" to avoid leaking which slugs exist / are owned. */
export function withdrawCommunityQuestion(slug: string, ownerToken: string): Promise<boolean> {
  return withdrawOwnedBySlug("community_questions", slug, ownerToken);
}

export function listPublishedCommunityQuestions(filter?: {
  categorySlug?: string;
  limit?: number;
}): Promise<CommunityQuestionJoinedRow[]> {
  return listPublishedJoined<CommunityQuestionJoinedRow>("community_questions", filter);
}

export function getPublishedCommunityQuestion(
  slug: string,
): Promise<CommunityQuestionJoinedRow | null> {
  return getPublishedJoinedBySlug<CommunityQuestionJoinedRow>("community_questions", slug);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Records a "Same issue" reaction, deduped per (question, hashed IP).
 *  Callers must pass an identified client IP — the route rejects requests
 *  whose IP cannot be determined (no shared "unknown" dedupe bucket).
 *  Returns null when the slug doesn't resolve to a published question. */
export async function addSameIssueReaction(
  slug: string,
  ip: string,
): Promise<{ same_issue_count: number; deduped: boolean } | null> {
  const question = await getDb()
    .prepare(`SELECT id FROM community_questions WHERE slug = ? AND status = 'published' AND withdrawn_at IS NULL`)
    .bind(slug)
    .first<{ id: number }>();
  if (!question) return null;

  const ipHash = await sha256Hex(ip);
  const insert = await getDb()
    .prepare(
      `INSERT OR IGNORE INTO community_reactions(question_id, kind, ip_hash, created_at)
       VALUES(?, 'same_issue', ?, unixepoch())`,
    )
    .bind(question.id, ipHash)
    .run();
  const inserted = (insert.meta.changes ?? 0) > 0;
  if (inserted) {
    await getDb()
      .prepare(`UPDATE community_questions SET same_issue_count = same_issue_count + 1 WHERE id = ?`)
      .bind(question.id)
      .run();
  }
  const counted = await getDb()
    .prepare(`SELECT same_issue_count FROM community_questions WHERE id = ?`)
    .bind(question.id)
    .first<{ same_issue_count: number }>();
  return { same_issue_count: counted?.same_issue_count ?? 0, deduped: !inserted };
}

// ─── Admin (CMS) queries — never exposed through the public API ────────────

export function listCommunityQuestionsAdmin(filter?: {
  status?: CommunityQuestionStatus;
  limit?: number;
}): Promise<CommunityQuestionJoinedRow[]> {
  return listAdminJoined<CommunityQuestionJoinedRow>("community_questions", filter);
}

export function setCommunityQuestionStatus(
  id: number,
  status: CommunityQuestionStatus,
): Promise<void> {
  return setStatusById("community_questions", id, status);
}

export async function saveCommunityExpertAnswer(
  id: number,
  expertAnswer: string | null,
  verified: boolean,
): Promise<void> {
  assertExpertAnswerInvariant(expertAnswer, verified);
  await getDb()
    .prepare(
      `UPDATE community_questions
       SET expert_answer = ?,
           expert_answer_updated_at = CASE WHEN ? IS NULL THEN NULL ELSE unixepoch() END,
           verified = ?,
           updated_at = unixepoch()
       WHERE id = ?`,
    )
    .bind(expertAnswer, expertAnswer, verified ? 1 : 0, id)
    .run();
}
