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
import { pickAvailableSlug, slugify } from "./community.slug";

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

async function findAvailableSlug(title: string): Promise<string> {
  const base = slugify(title);
  const taken = await getDb()
    .prepare(`SELECT slug FROM community_questions WHERE slug = ? OR slug LIKE ?`)
    .bind(base, `${base}-%`)
    .all<{ slug: string }>();
  return pickAvailableSlug(base, new Set((taken.results ?? []).map((r) => r.slug)));
}

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Error && err.message.includes("UNIQUE constraint failed");
}

export async function createCommunityQuestion(
  input: CreateCommunityQuestionInput,
): Promise<{ id: number; slug: string }> {
  let categoryId: number | null = null;
  if (input.category_slug) {
    const cat = await getDb()
      .prepare(`SELECT id FROM community_categories WHERE slug = ?`)
      .bind(input.category_slug)
      .first<{ id: number }>();
    categoryId = cat?.id ?? null;
  }
  const utmJson = input.utm ? JSON.stringify(input.utm) : null;

  const insert = (slug: string) =>
    getDb()
      .prepare(
        `INSERT INTO community_questions(
           slug, title, body, category_id, author_name, author_email,
           locale, ip, user_agent, utm_json, status, created_at, updated_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', unixepoch(), unixepoch())
         RETURNING id`,
      )
      .bind(
        slug,
        input.title.trim(),
        input.body.trim(),
        categoryId,
        input.author_name.trim(),
        input.author_email.toLowerCase().trim(),
        input.locale ?? null,
        input.ip ?? null,
        input.user_agent ?? null,
        utmJson,
      )
      .first<{ id: number }>();

  let slug = await findAvailableSlug(input.title);
  let row: { id: number } | null;
  try {
    row = await insert(slug);
  } catch (err) {
    // Concurrent submit picked the same slug between our SELECT and INSERT —
    // retry once with a random suffix (collision odds are then negligible).
    if (!isUniqueConstraintError(err)) throw err;
    slug = `${slugify(input.title)}-${crypto.randomUUID().slice(0, 8)}`;
    row = await insert(slug);
  }
  if (!row) throw new Error("Failed to create community question");
  return { id: row.id, slug };
}

const JOINED_SELECT = `
  SELECT q.*, c.slug AS category_slug, c.name AS category_name
  FROM community_questions q
  LEFT JOIN community_categories c ON c.id = q.category_id`;

export async function listPublishedCommunityQuestions(filter?: {
  categorySlug?: string;
  limit?: number;
}): Promise<CommunityQuestionJoinedRow[]> {
  const limit = Math.min(filter?.limit ?? 50, 100);
  const sql = filter?.categorySlug
    ? `${JOINED_SELECT} WHERE q.status = 'published' AND c.slug = ?
       ORDER BY q.published_at DESC LIMIT ?`
    : `${JOINED_SELECT} WHERE q.status = 'published'
       ORDER BY q.published_at DESC LIMIT ?`;
  const stmt = filter?.categorySlug
    ? getDb().prepare(sql).bind(filter.categorySlug, limit)
    : getDb().prepare(sql).bind(limit);
  const result = await stmt.all<CommunityQuestionJoinedRow>();
  return result.results ?? [];
}

export async function getPublishedCommunityQuestion(
  slug: string,
): Promise<CommunityQuestionJoinedRow | null> {
  return getDb()
    .prepare(`${JOINED_SELECT} WHERE q.slug = ? AND q.status = 'published' LIMIT 1`)
    .bind(slug)
    .first<CommunityQuestionJoinedRow>();
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
    .prepare(`SELECT id FROM community_questions WHERE slug = ? AND status = 'published'`)
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

export async function listCommunityQuestionsAdmin(filter?: {
  status?: CommunityQuestionStatus;
  limit?: number;
}): Promise<CommunityQuestionJoinedRow[]> {
  const limit = Math.min(filter?.limit ?? 200, 500);
  const sql = filter?.status
    ? `${JOINED_SELECT} WHERE q.status = ? ORDER BY q.created_at DESC LIMIT ?`
    : `${JOINED_SELECT} ORDER BY q.created_at DESC LIMIT ?`;
  const stmt = filter?.status
    ? getDb().prepare(sql).bind(filter.status, limit)
    : getDb().prepare(sql).bind(limit);
  const result = await stmt.all<CommunityQuestionJoinedRow>();
  return result.results ?? [];
}

export async function setCommunityQuestionStatus(
  id: number,
  status: CommunityQuestionStatus,
): Promise<void> {
  await getDb()
    .prepare(
      `UPDATE community_questions
       SET status = ?,
           updated_at = unixepoch(),
           published_at = CASE
             WHEN ? = 'published' AND published_at IS NULL THEN unixepoch()
             ELSE published_at
           END
       WHERE id = ?`,
    )
    .bind(status, status, id)
    .run();
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
