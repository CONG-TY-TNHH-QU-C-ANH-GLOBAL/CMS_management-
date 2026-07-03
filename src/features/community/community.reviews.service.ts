// Community Verified Reviews service (Sprint 4) — seller trust layer.
//
// Moderation-first, mirroring Q&A (community.service.ts): submissions land as
// status='pending' and only operators publish + verify them. The indexing gate
// lives in community.policy.ts (published AND verified AND non-thin body);
// landing derives its noindex rules from it.
//
// Reuses community_categories (shared taxonomy) and the shared D1 mechanics in
// community.repo.ts. What stays explicit here: the review-specific columns
// (rating, private evidence/order, public_summary) and their moderation edit.

import { getDb } from "@/core/db/client";

import {
  getPublishedJoinedBySlug,
  insertWithUniqueSlug,
  listAdminJoined,
  listPublishedJoined,
  prepareCommunitySubmission,
  setStatusById,
  withdrawOwnedBySlug,
} from "./community.repo";
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

export async function createCommunityReview(
  input: CreateCommunityReviewInput,
): Promise<{ id: number; slug: string; ownerToken: string }> {
  const { categoryId, utmJson, ownerToken, ownerTokenHash } = await prepareCommunitySubmission(input);

  const { id, slug } = await insertWithUniqueSlug("community_reviews", input.title, (s) =>
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
        s,
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
      .first<{ id: number }>(),
  );
  return { id, slug, ownerToken };
}

export function withdrawCommunityReview(slug: string, ownerToken: string): Promise<boolean> {
  return withdrawOwnedBySlug("community_reviews", slug, ownerToken);
}

export function listPublishedCommunityReviews(filter?: {
  categorySlug?: string;
  limit?: number;
}): Promise<CommunityReviewJoinedRow[]> {
  return listPublishedJoined<CommunityReviewJoinedRow>("community_reviews", filter);
}

export function getPublishedCommunityReview(slug: string): Promise<CommunityReviewJoinedRow | null> {
  return getPublishedJoinedBySlug<CommunityReviewJoinedRow>("community_reviews", slug);
}

// ─── Admin (CMS) queries — never exposed through the public API ────────────

export function listCommunityReviewsAdmin(filter?: {
  status?: CommunityReviewStatus;
  limit?: number;
}): Promise<CommunityReviewJoinedRow[]> {
  return listAdminJoined<CommunityReviewJoinedRow>("community_reviews", filter);
}

export function setCommunityReviewStatus(id: number, status: CommunityReviewStatus): Promise<void> {
  return setStatusById("community_reviews", id, status);
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
