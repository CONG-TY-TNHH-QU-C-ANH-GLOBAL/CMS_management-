// Boring, table-parameterized D1 mechanics shared by the Q&A and Reviews
// services. These are pure plumbing (slug retry, owner-token withdrawal,
// status transition, the published/admin joined queries) — the domain policy
// (what "verified"/"indexable" means, which columns each table carries, the
// whitelist mappers) stays explicit in each feature file.
//
// `table` is always an internal literal ("community_questions" /
// "community_reviews"), never user input — safe to interpolate.

import { getDb } from "@/core/db/client";

import { generateOwnerToken, hashOwnerToken } from "./community.owner";
import { pickAvailableSlug, slugify } from "./community.slug";

export type CommunityTable = "community_questions" | "community_reviews";

export function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Error && err.message.includes("UNIQUE constraint failed");
}

/** Shared submit prologue: resolve the category slug to an id (null when
 *  absent/unknown), serialize utm, and mint a one-time owner token (raw handed
 *  back once, only the hash is persisted). */
export async function prepareCommunitySubmission(input: {
  category_slug?: string | null;
  utm?: Record<string, string> | null;
}): Promise<{ categoryId: number | null; utmJson: string | null; ownerToken: string; ownerTokenHash: string }> {
  let categoryId: number | null = null;
  if (input.category_slug) {
    const cat = await getDb()
      .prepare(`SELECT id FROM community_categories WHERE slug = ?`)
      .bind(input.category_slug)
      .first<{ id: number }>();
    categoryId = cat?.id ?? null;
  }
  const utmJson = input.utm ? JSON.stringify(input.utm) : null;
  const ownerToken = generateOwnerToken();
  const ownerTokenHash = await hashOwnerToken(ownerToken);
  return { categoryId, utmJson, ownerToken, ownerTokenHash };
}

async function findAvailableSlug(table: CommunityTable, title: string): Promise<string> {
  const base = slugify(title);
  const taken = await getDb()
    .prepare(`SELECT slug FROM ${table} WHERE slug = ? OR slug LIKE ?`)
    .bind(base, `${base}-%`)
    .all<{ slug: string }>();
  return pickAvailableSlug(base, new Set((taken.results ?? []).map((r) => r.slug)));
}

/** Insert with a one-shot slug-collision retry (concurrent submit picked the
 *  same slug between our SELECT and INSERT). `insert(slug)` runs the
 *  table-specific `INSERT … RETURNING id`. */
export async function insertWithUniqueSlug(
  table: CommunityTable,
  title: string,
  insert: (slug: string) => Promise<{ id: number } | null>,
): Promise<{ id: number; slug: string }> {
  let slug = await findAvailableSlug(table, title);
  let row: { id: number } | null;
  try {
    row = await insert(slug);
  } catch (err) {
    if (!isUniqueConstraintError(err)) throw err;
    slug = `${slugify(title)}-${crypto.randomUUID().slice(0, 8)}`;
    row = await insert(slug);
  }
  if (!row) throw new Error(`Failed to insert into ${table}`);
  return { id: row.id, slug };
}

/** Soft-withdraw a row the caller owns (owner-token hash match). Returns true
 *  only when the token matches an active (not withdrawn) row. Callers must NOT
 *  distinguish "not found" from "wrong token" — no ownership enumeration. */
export async function withdrawOwnedBySlug(
  table: CommunityTable,
  slug: string,
  ownerToken: string,
): Promise<boolean> {
  const row = await getDb()
    .prepare(`SELECT id, owner_token_hash FROM ${table} WHERE slug = ? AND withdrawn_at IS NULL LIMIT 1`)
    .bind(slug)
    .first<{ id: number; owner_token_hash: string | null }>();
  if (!row?.owner_token_hash) return false;

  const presented = await hashOwnerToken(ownerToken);
  if (presented !== row.owner_token_hash) return false;

  await getDb()
    .prepare(`UPDATE ${table} SET withdrawn_at = unixepoch(), updated_at = unixepoch() WHERE id = ?`)
    .bind(row.id)
    .run();
  return true;
}

/** Set status, stamping published_at on the first transition to 'published'. */
export async function setStatusById(
  table: CommunityTable,
  id: number,
  status: string,
): Promise<void> {
  await getDb()
    .prepare(
      `UPDATE ${table}
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

function joinedSelect(table: CommunityTable): string {
  return `SELECT t.*, c.slug AS category_slug, c.name AS category_name
  FROM ${table} t
  LEFT JOIN community_categories c ON c.id = t.category_id`;
}

/** Published + non-withdrawn rows, newest first, optionally filtered by the
 *  canonical category slug (join on category_id, never a display label). */
export async function listPublishedJoined<T>(
  table: CommunityTable,
  filter?: { categorySlug?: string; limit?: number },
): Promise<T[]> {
  const limit = Math.min(filter?.limit ?? 50, 100);
  const sql = filter?.categorySlug
    ? `${joinedSelect(table)} WHERE t.status = 'published' AND t.withdrawn_at IS NULL AND c.slug = ?
       ORDER BY t.published_at DESC LIMIT ?`
    : `${joinedSelect(table)} WHERE t.status = 'published' AND t.withdrawn_at IS NULL
       ORDER BY t.published_at DESC LIMIT ?`;
  const stmt = filter?.categorySlug
    ? getDb().prepare(sql).bind(filter.categorySlug, limit)
    : getDb().prepare(sql).bind(limit);
  const result = await stmt.all<T>();
  return result.results ?? [];
}

export async function getPublishedJoinedBySlug<T>(
  table: CommunityTable,
  slug: string,
): Promise<T | null> {
  return getDb()
    .prepare(`${joinedSelect(table)} WHERE t.slug = ? AND t.status = 'published' AND t.withdrawn_at IS NULL LIMIT 1`)
    .bind(slug)
    .first<T>();
}

/** Admin list — all rows (any status, including withdrawn), newest first. */
export async function listAdminJoined<T>(
  table: CommunityTable,
  filter?: { status?: string; limit?: number },
): Promise<T[]> {
  const limit = Math.min(filter?.limit ?? 200, 500);
  const sql = filter?.status
    ? `${joinedSelect(table)} WHERE t.status = ? ORDER BY t.created_at DESC LIMIT ?`
    : `${joinedSelect(table)} ORDER BY t.created_at DESC LIMIT ?`;
  const stmt = filter?.status
    ? getDb().prepare(sql).bind(filter.status, limit)
    : getDb().prepare(sql).bind(limit);
  const result = await stmt.all<T>();
  return result.results ?? [];
}
