// Lifecycle service for blog_post_translations. Mirrors testimonial /
// careers-job services. All status mutations go through applyTransition.
//
// Translatable fields per the blog_posts shape:
//   - title              (text, required)
//   - excerpt            (text, nullable)
//   - category           (text, nullable; display label, not enum slug)
//   - seo_title          (text, nullable)
//   - seo_description    (text, nullable)

import { getDb } from "@/core/db/client";
import { auditLog } from "@/core/db/mutations";

import { applyTransition } from "./translations.transitions";
import { computeSourceHash } from "./translations.hash";
import type { TargetLocale } from "./translations.service";

export interface BlogPostTranslationRow {
  id: number;
  blog_post_id: number;
  locale: TargetLocale;
  title: string;
  excerpt: string | null;
  category: string | null;
  seo_title: string | null;
  seo_description: string | null;
  status: "draft" | "reviewed" | "stale" | "failed";
  stale_reason: string | null;
  source_locale: string;
  source_hash: string;
  source_snapshot: string | null;
  ai_generated_at: number | null;
  ai_model: string | null;
  prompt_version: string | null;
  reviewed_at: number | null;
  reviewed_by: number | null;
  in_flight_until: number | null;
  created_at: number;
  updated_at: number;
}

const BP_TRANS_COLUMNS = `id, blog_post_id, locale, title, excerpt, category,
  seo_title, seo_description, status, stale_reason, source_locale, source_hash,
  source_snapshot, ai_generated_at, ai_model, prompt_version, reviewed_at,
  reviewed_by, in_flight_until, created_at, updated_at`;

export async function listBlogPostTranslationsForId(
  blogPostId: number,
): Promise<BlogPostTranslationRow[]> {
  const result = await getDb()
    .prepare(
      `SELECT ${BP_TRANS_COLUMNS} FROM blog_post_translations
        WHERE blog_post_id = ? ORDER BY locale`,
    )
    .bind(blogPostId)
    .all<BlogPostTranslationRow>();
  return result.results ?? [];
}

export async function listAllBlogPostTranslations(): Promise<BlogPostTranslationRow[]> {
  const result = await getDb()
    .prepare(
      `SELECT ${BP_TRANS_COLUMNS} FROM blog_post_translations
        ORDER BY blog_post_id, locale`,
    )
    .all<BlogPostTranslationRow>();
  return result.results ?? [];
}

export async function approveBlogPostTranslation(
  actorId: number,
  translationId: number,
): Promise<{ from: string; to: string }> {
  return applyTransition("blog_post_translations", translationId, {
    kind: "operator_approved",
    userId: actorId,
  });
}

export interface BlogPostEditInput {
  id: number;
  title: string;
  excerpt: string | null;
  category: string | null;
  seo_title: string | null;
  seo_description: string | null;
}

export async function editBlogPostTranslation(
  actorId: number,
  input: BlogPostEditInput,
): Promise<{ from: string; to: string }> {
  const now = Math.floor(Date.now() / 1000);
  const before = await getDb()
    .prepare(`SELECT ${BP_TRANS_COLUMNS} FROM blog_post_translations WHERE id = ? LIMIT 1`)
    .bind(input.id)
    .first<BlogPostTranslationRow>();
  if (!before) {
    throw Object.assign(new Error("Translation không tồn tại."), { statusCode: 404 });
  }

  await getDb()
    .prepare(
      `UPDATE blog_post_translations
          SET title = ?, excerpt = ?, category = ?, seo_title = ?, seo_description = ?,
              updated_at = ?
        WHERE id = ?`,
    )
    .bind(
      input.title,
      input.excerpt,
      input.category,
      input.seo_title,
      input.seo_description,
      now,
      input.id,
    )
    .run();

  await auditLog(
    actorId,
    "update",
    "blog_post_translations",
    input.id,
    {
      title: before.title,
      excerpt: before.excerpt,
      category: before.category,
      seo_title: before.seo_title,
      seo_description: before.seo_description,
    },
    {
      title: input.title,
      excerpt: input.excerpt,
      category: input.category,
      seo_title: input.seo_title,
      seo_description: input.seo_description,
    },
  );

  return applyTransition("blog_post_translations", input.id, {
    kind: "operator_edited",
    userId: actorId,
  });
}

export async function markBlogPostTranslationStale(
  actorId: number,
  translationId: number,
): Promise<{ from: string; to: string }> {
  return applyTransition("blog_post_translations", translationId, {
    kind: "manual_mark_stale",
    userId: actorId,
  });
}

export async function deleteBlogPostTranslation(actorId: number, id: number): Promise<void> {
  const before = await getDb()
    .prepare(`SELECT ${BP_TRANS_COLUMNS} FROM blog_post_translations WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<BlogPostTranslationRow>();
  if (!before) return;
  await getDb()
    .prepare(`DELETE FROM blog_post_translations WHERE id = ?`)
    .bind(id)
    .run();
  await auditLog(actorId, "delete", "blog_post_translations", id, before, null);
}

export async function onBlogPostSourceChanged(
  blogPostId: number,
  newSource: {
    title: string;
    excerpt: string | null;
    category: string | null;
    seo_title: string | null;
    seo_description: string | null;
  },
): Promise<{ stale_count: number }> {
  const newHash = await computeSourceHash({
    title: newSource.title,
    excerpt: newSource.excerpt ?? "",
    category: newSource.category ?? "",
    seo_title: newSource.seo_title ?? "",
    seo_description: newSource.seo_description ?? "",
  });
  const rows = await getDb()
    .prepare(
      `SELECT id, source_hash, status FROM blog_post_translations
        WHERE blog_post_id = ?`,
    )
    .bind(blogPostId)
    .all<{ id: number; source_hash: string; status: string }>();
  let staleCount = 0;
  for (const row of rows.results ?? []) {
    if (row.source_hash === newHash) continue;
    try {
      await applyTransition("blog_post_translations", row.id, { kind: "source_changed" });
      staleCount += 1;
    } catch {
      // failed row or other invalid transition — leave it as-is
    }
  }
  return { stale_count: staleCount };
}
