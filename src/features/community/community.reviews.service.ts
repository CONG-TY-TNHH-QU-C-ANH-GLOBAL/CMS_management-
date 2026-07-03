// Community Verified Reviews service (Sprint 4) — seller trust layer.
//
// Moderation-first, mirroring Q&A (community.service.ts): submissions land as
// status='pending' and only operators publish + verify them. The indexing gate
// lives in community.policy.ts (published AND verified AND non-thin body);
// landing derives its noindex rules from it.
//
// Reuses community_categories (shared taxonomy) and the owner-token / slug
// helpers. Reviews differ from questions enough (rating, no expert answer,
// operator public_summary, private evidence/order fields) that they get their
// own service rather than overloading the questions one.

import { getDb } from "@/core/db/client";

import { generateOwnerToken, hashOwnerToken } from "./community.owner";
import { pickAvailableSlug, slugify } from "./community.slug";
import type { CommunityLocale } from "./community.service";

export type CommunityReviewStatus = "pending" | "published" | "rejected";

export interface CommunityReviewRow {
  id: number;
  slug: string;
  title: string;
  body: string;
  category_id: number | null;
  reviewer_name: string;
  reviewer_email: string;
  rating: number | null;
  locale: CommunityLocale | null;
  ip: string | null;
  user_agent: string | null;
  utm_json: string | null;
  status: CommunityReviewStatus;
  verified: number;
  public_summary: string | null;
  private_evidence_note: string | null;
  private_order_reference: string | null;
  // owner_token_hash / withdrawn_at are admin/internal only — never mapped to a
  // public response. Withdrawn = withdrawn_at set.
  owner_token_hash: string | null;
  withdrawn_at: number | null;
  created_at: number;
  updated_at: number;
  published_at: number | null;
}

/** Review row joined with its category (for both public + admin lists). */
export interface CommunityReviewJoinedRow extends CommunityReviewRow {
  category_slug: string | null;
  category_name: string | null;
}

export interface CreateCommunityReviewInput {
  title: string;
  body: string;
  category_slug?: string | null;
  reviewer_name: string;
  reviewer_email: string;
  rating?: number | null;
  locale?: CommunityLocale | null;
  private_evidence_note?: string | null;
  private_order_reference?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  utm?: Record<string, string> | null;
}

async function findAvailableSlug(title: string): Promise<string> {
  const base = slugify(title);
  const taken = await getDb()
    .prepare(`SELECT slug FROM community_reviews WHERE slug = ? OR slug LIKE ?`)
    .bind(base, `${base}-%`)
    .all<{ slug: string }>();
  return pickAvailableSlug(base, new Set((taken.results ?? []).map((r) => r.slug)));
}

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Error && err.message.includes("UNIQUE constraint failed");
}

export async function createCommunityReview(
  input: CreateCommunityReviewInput,
): Promise<{ id: number; slug: string; ownerToken: string }> {
  let categoryId: number | null = null;
  if (input.category_slug) {
    const cat = await getDb()
      .prepare(`SELECT id FROM community_categories WHERE slug = ?`)
      .bind(input.category_slug)
      .first<{ id: number }>();
    categoryId = cat?.id ?? null;
  }
  const utmJson = input.utm ? JSON.stringify(input.utm) : null;

  // Owner token: returned once so the submitter can withdraw from this browser.
  // Only the hash is persisted.
  const ownerToken = generateOwnerToken();
  const ownerTokenHash = await hashOwnerToken(ownerToken);

  const insert = (slug: string) =>
    getDb()
      .prepare(
        `INSERT INTO community_reviews(
           slug, title, body, category_id, reviewer_name, reviewer_email, rating,
           locale, private_evidence_note, private_order_reference,
           ip, user_agent, utm_json, owner_token_hash, status, created_at, updated_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', unixepoch(), unixepoch())
         RETURNING id`,
      )
      .bind(
        slug,
        input.title.trim(),
        input.body.trim(),
        categoryId,
        input.reviewer_name.trim(),
        input.reviewer_email.toLowerCase().trim(),
        input.rating ?? null,
        input.locale ?? null,
        input.private_evidence_note?.trim() || null,
        input.private_order_reference?.trim() || null,
        input.ip ?? null,
        input.user_agent ?? null,
        utmJson,
        ownerTokenHash,
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
  if (!row) throw new Error("Failed to create community review");
  return { id: row.id, slug, ownerToken };
}

/** Soft-withdraw a review the caller owns (proves ownership via the raw token).
 *  Returns true only when the token matches an active (not already withdrawn)
 *  review. Callers must NOT distinguish "not found" from "wrong token" to avoid
 *  leaking which slugs exist / are owned. */
export async function withdrawCommunityReview(
  slug: string,
  ownerToken: string,
): Promise<boolean> {
  const row = await getDb()
    .prepare(
      `SELECT id, owner_token_hash FROM community_reviews
       WHERE slug = ? AND withdrawn_at IS NULL LIMIT 1`,
    )
    .bind(slug)
    .first<{ id: number; owner_token_hash: string | null }>();
  if (!row?.owner_token_hash) return false;

  const presented = await hashOwnerToken(ownerToken);
  if (presented !== row.owner_token_hash) return false;

  await getDb()
    .prepare(`UPDATE community_reviews SET withdrawn_at = unixepoch(), updated_at = unixepoch() WHERE id = ?`)
    .bind(row.id)
    .run();
  return true;
}

const JOINED_SELECT = `
  SELECT r.*, c.slug AS category_slug, c.name AS category_name
  FROM community_reviews r
  LEFT JOIN community_categories c ON c.id = r.category_id`;

export async function listPublishedCommunityReviews(filter?: {
  categorySlug?: string;
  limit?: number;
}): Promise<CommunityReviewJoinedRow[]> {
  const limit = Math.min(filter?.limit ?? 50, 100);
  const sql = filter?.categorySlug
    ? `${JOINED_SELECT} WHERE r.status = 'published' AND r.withdrawn_at IS NULL AND c.slug = ?
       ORDER BY r.published_at DESC LIMIT ?`
    : `${JOINED_SELECT} WHERE r.status = 'published' AND r.withdrawn_at IS NULL
       ORDER BY r.published_at DESC LIMIT ?`;
  const stmt = filter?.categorySlug
    ? getDb().prepare(sql).bind(filter.categorySlug, limit)
    : getDb().prepare(sql).bind(limit);
  const result = await stmt.all<CommunityReviewJoinedRow>();
  return result.results ?? [];
}

export async function getPublishedCommunityReview(
  slug: string,
): Promise<CommunityReviewJoinedRow | null> {
  return getDb()
    .prepare(`${JOINED_SELECT} WHERE r.slug = ? AND r.status = 'published' AND r.withdrawn_at IS NULL LIMIT 1`)
    .bind(slug)
    .first<CommunityReviewJoinedRow>();
}

// ─── Admin (CMS) queries — never exposed through the public API ────────────

export async function listCommunityReviewsAdmin(filter?: {
  status?: CommunityReviewStatus;
  limit?: number;
}): Promise<CommunityReviewJoinedRow[]> {
  const limit = Math.min(filter?.limit ?? 200, 500);
  const sql = filter?.status
    ? `${JOINED_SELECT} WHERE r.status = ? ORDER BY r.created_at DESC LIMIT ?`
    : `${JOINED_SELECT} ORDER BY r.created_at DESC LIMIT ?`;
  const stmt = filter?.status
    ? getDb().prepare(sql).bind(filter.status, limit)
    : getDb().prepare(sql).bind(limit);
  const result = await stmt.all<CommunityReviewJoinedRow>();
  return result.results ?? [];
}

export async function setCommunityReviewStatus(
  id: number,
  status: CommunityReviewStatus,
): Promise<void> {
  await getDb()
    .prepare(
      `UPDATE community_reviews
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

/** Operator moderation edit: optional public gloss + the "Verified by THG"
 *  trust stamp. Unlike Q&A, verifying a review needs no separate answer — the
 *  review body itself is the content (NOT NULL), so there is no invariant. */
export async function saveCommunityReviewModeration(
  id: number,
  publicSummary: string | null,
  verified: boolean,
): Promise<void> {
  await getDb()
    .prepare(
      `UPDATE community_reviews
       SET public_summary = ?,
           verified = ?,
           updated_at = unixepoch()
       WHERE id = ?`,
    )
    .bind(publicSummary, verified ? 1 : 0, id)
    .run();
}
