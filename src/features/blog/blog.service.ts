// Blog service — read + write functions for blog_posts + blog_slides.
// Slugs are shared across locales (1 slug × 3 locales = 3 rows). Slides are per-post (per locale).

import { getDb } from "@/core/db/client";
import { auditLog } from "@/core/db/mutations";

export type BlogStatus = "draft" | "review" | "live" | "archived";
export type BlogLocale = "en" | "vi" | "zh";

export interface BlogPostRow {
  id: number;
  slug: string;
  locale: BlogLocale;
  title: string;
  excerpt: string | null;
  thumbnail_media_id: number | null;
  thumbnail_url: string | null;
  category: string | null;
  published_date: string | null;
  status: BlogStatus;
  seo_title: string | null;
  seo_description: string | null;
  og_image_id: number | null;
  author_id: number | null;
  updated_at: number;
  slide_count: number;
}

export interface BlogSlideRow {
  id: number;
  post_id: number;
  position: number;
  media_id: number;
  alt_text: string;
  src: string;
}

export async function listBlogPosts(filter?: {
  locale?: BlogLocale;
  status?: BlogStatus;
}): Promise<BlogPostRow[]> {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (filter?.locale) { where.push("p.locale = ?"); binds.push(filter.locale); }
  if (filter?.status) { where.push("p.status = ?"); binds.push(filter.status); }
  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const sql = `
    SELECT p.id, p.slug, p.locale, p.title, p.excerpt, p.thumbnail_media_id,
           m.r2_key AS thumbnail_url, p.category, p.published_date, p.status,
           p.seo_title, p.seo_description, p.og_image_id, p.author_id, p.updated_at,
           (SELECT COUNT(*) FROM blog_slides s WHERE s.post_id = p.id) AS slide_count
      FROM blog_posts p
      LEFT JOIN media m ON m.id = p.thumbnail_media_id
      ${whereClause}
      ORDER BY p.published_date DESC NULLS LAST, p.updated_at DESC
  `;
  const stmt = binds.length > 0 ? getDb().prepare(sql).bind(...binds) : getDb().prepare(sql);
  const result = await stmt.all<BlogPostRow>();
  return result.results ?? [];
}

export async function getBlogPost(slug: string, locale: BlogLocale): Promise<BlogPostRow | null> {
  const result = await getDb()
    .prepare(
      `SELECT p.id, p.slug, p.locale, p.title, p.excerpt, p.thumbnail_media_id,
              m.r2_key AS thumbnail_url, p.category, p.published_date, p.status,
              p.seo_title, p.seo_description, p.og_image_id, p.author_id, p.updated_at,
              (SELECT COUNT(*) FROM blog_slides s WHERE s.post_id = p.id) AS slide_count
         FROM blog_posts p
         LEFT JOIN media m ON m.id = p.thumbnail_media_id
        WHERE p.slug = ? AND p.locale = ? LIMIT 1`,
    )
    .bind(slug, locale)
    .first<BlogPostRow>();
  return result ?? null;
}

// ────────────────────────────────────────────────────────────────────────
// Public-facing reads (spec §7.1 — JOIN blog_post_translations)
// ────────────────────────────────────────────────────────────────────────
// Two-step resolver: VI-canonical (VI source + reviewed translation), then
// legacy fallback for slugs without VI source or whose translation is
// draft/stale/failed. Preserves data authored before the AI pipeline.
//
// Translated columns: title, excerpt, category, seo_title, seo_description
// Non-translated: slug, thumbnail_*, published_date, status, og_image_id, etc.

export async function listBlogPostsForPublic(filter?: {
  locale: BlogLocale;
  status?: BlogStatus;
}): Promise<BlogPostRow[]> {
  if (!filter?.locale || filter.locale === "vi") {
    return listBlogPosts({ locale: "vi", status: filter?.status });
  }

  // Step 1 — VI-canonical
  const where: string[] = ["p.locale = 'vi'"];
  const binds: unknown[] = [filter.locale, filter.locale];
  if (filter.status) { where.push("p.status = ?"); binds.push(filter.status); }
  const viBackedSql = `
    SELECT p.id, p.slug, ? AS locale, t.title, t.excerpt, p.thumbnail_media_id,
           m.r2_key AS thumbnail_url, t.category, p.published_date, p.status,
           t.seo_title, t.seo_description, p.og_image_id, p.author_id, p.updated_at,
           (SELECT COUNT(*) FROM blog_slides s WHERE s.post_id = p.id) AS slide_count
      FROM blog_posts p
      JOIN blog_post_translations t
        ON t.blog_post_id = p.id AND t.locale = ? AND t.status = 'reviewed'
      LEFT JOIN media m ON m.id = p.thumbnail_media_id
     WHERE ${where.join(" AND ")}
     ORDER BY p.published_date DESC NULLS LAST, p.updated_at DESC
  `;
  const viBacked = await getDb().prepare(viBackedSql).bind(...binds).all<BlogPostRow>();
  const viBackedRows = viBacked.results ?? [];
  const viBackedSlugs = new Set(viBackedRows.map((r) => r.slug));

  // Step 2 — Legacy fallback
  const legacyRows = await listBlogPosts({ locale: filter.locale, status: filter.status });
  const fallback = legacyRows.filter((r) => !viBackedSlugs.has(r.slug));

  return [...viBackedRows, ...fallback].sort((a, b) => {
    const ad = a.published_date ?? "";
    const bd = b.published_date ?? "";
    if (ad !== bd) return bd.localeCompare(ad);
    return b.updated_at - a.updated_at;
  });
}

export async function getBlogPostForPublic(
  slug: string,
  locale: BlogLocale,
): Promise<BlogPostRow | null> {
  if (locale === "vi") return getBlogPost(slug, "vi");

  const viBacked = await getDb()
    .prepare(
      `SELECT p.id, p.slug, ? AS locale, t.title, t.excerpt, p.thumbnail_media_id,
              m.r2_key AS thumbnail_url, t.category, p.published_date, p.status,
              t.seo_title, t.seo_description, p.og_image_id, p.author_id, p.updated_at,
              (SELECT COUNT(*) FROM blog_slides s WHERE s.post_id = p.id) AS slide_count
         FROM blog_posts p
         JOIN blog_post_translations t
           ON t.blog_post_id = p.id AND t.locale = ? AND t.status = 'reviewed'
         LEFT JOIN media m ON m.id = p.thumbnail_media_id
        WHERE p.slug = ? AND p.locale = 'vi' LIMIT 1`,
    )
    .bind(locale, locale, slug)
    .first<BlogPostRow>();
  if (viBacked) return viBacked;
  return getBlogPost(slug, locale);
}

export async function getBlogSlides(postId: number): Promise<BlogSlideRow[]> {
  const result = await getDb()
    .prepare(
      `SELECT s.id, s.post_id, s.position, s.media_id, s.alt_text, m.r2_key AS src
         FROM blog_slides s JOIN media m ON m.id = s.media_id
        WHERE s.post_id = ? ORDER BY s.position`,
    )
    .bind(postId)
    .all<BlogSlideRow>();
  return result.results ?? [];
}

export async function listBlogCategories(locale: BlogLocale): Promise<string[]> {
  if (locale === "vi") {
    const rows = await getDb()
      .prepare(
        `SELECT DISTINCT category FROM blog_posts
          WHERE status = 'live' AND locale = 'vi' AND category IS NOT NULL
          ORDER BY category`,
      )
      .all<{ category: string }>();
    return (rows.results ?? []).map((r) => r.category);
  }

  // EN/ZH: reviewed translations first, then legacy fallback
  const translated = await getDb()
    .prepare(
      `SELECT DISTINCT t.category FROM blog_posts p
        JOIN blog_post_translations t ON t.blog_post_id = p.id
          AND t.locale = ? AND t.status = 'reviewed'
        WHERE p.status = 'live' AND p.locale = 'vi' AND t.category IS NOT NULL
        ORDER BY t.category`,
    )
    .bind(locale)
    .all<{ category: string }>();
  const cats = new Set((translated.results ?? []).map((r) => r.category));

  const legacy = await getDb()
    .prepare(
      `SELECT DISTINCT category FROM blog_posts
        WHERE status = 'live' AND locale = ? AND category IS NOT NULL
        ORDER BY category`,
    )
    .bind(locale)
    .all<{ category: string }>();
  for (const r of legacy.results ?? []) cats.add(r.category);

  return [...cats].sort();
}

// Returns posts grouped by slug → list of {locale, title, ...} variants.
// Used by admin list view to show all 3 locales in one row.
export async function listBlogPostsGrouped(): Promise<
  Array<{ slug: string; category: string | null; published_date: string | null; updated_at: number; variants: BlogPostRow[] }>
> {
  const all = await listBlogPosts();
  const map = new Map<string, BlogPostRow[]>();
  for (const p of all) {
    if (!map.has(p.slug)) map.set(p.slug, []);
    map.get(p.slug)!.push(p);
  }
  return Array.from(map.entries()).map(([slug, variants]) => {
    const ref = variants[0];
    return {
      slug,
      category: ref.category,
      published_date: ref.published_date,
      updated_at: Math.max(...variants.map((v) => v.updated_at)),
      variants,
    };
  }).sort((a, b) => (b.published_date ?? "").localeCompare(a.published_date ?? ""));
}

// ─────────────────────────────── mutations ───────────────────────────────

export async function upsertBlogPost(
  actorId: number,
  input: {
    slug: string;
    locale: BlogLocale;
    title: string;
    excerpt?: string | null;
    thumbnail_media_id?: number | null;
    category?: string | null;
    published_date?: string | null;
    status?: BlogStatus;
    seo_title?: string | null;
    seo_description?: string | null;
    og_image_id?: number | null;
  },
): Promise<BlogPostRow> {
  const before = await getBlogPost(input.slug, input.locale);

  if (before) {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (input.title !== undefined) { fields.push("title = ?"); values.push(input.title); }
    if (input.excerpt !== undefined) { fields.push("excerpt = ?"); values.push(input.excerpt); }
    if (input.thumbnail_media_id !== undefined) { fields.push("thumbnail_media_id = ?"); values.push(input.thumbnail_media_id); }
    if (input.category !== undefined) { fields.push("category = ?"); values.push(input.category); }
    if (input.published_date !== undefined) { fields.push("published_date = ?"); values.push(input.published_date); }
    if (input.status !== undefined) { fields.push("status = ?"); values.push(input.status); }
    if (input.seo_title !== undefined) { fields.push("seo_title = ?"); values.push(input.seo_title); }
    if (input.seo_description !== undefined) { fields.push("seo_description = ?"); values.push(input.seo_description); }
    if (input.og_image_id !== undefined) { fields.push("og_image_id = ?"); values.push(input.og_image_id); }
    fields.push("updated_at = unixepoch()");
    values.push(input.slug, input.locale);
    if (fields.length > 1) {
      await getDb()
        .prepare(`UPDATE blog_posts SET ${fields.join(", ")} WHERE slug = ? AND locale = ?`)
        .bind(...values)
        .run();
    }
  } else {
    await getDb()
      .prepare(
        `INSERT INTO blog_posts (slug, locale, title, excerpt, thumbnail_media_id, category, published_date, status, seo_title, seo_description, og_image_id, author_id, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`,
      )
      .bind(
        input.slug,
        input.locale,
        input.title,
        input.excerpt ?? null,
        input.thumbnail_media_id ?? null,
        input.category ?? null,
        input.published_date ?? null,
        input.status ?? "draft",
        input.seo_title ?? null,
        input.seo_description ?? null,
        input.og_image_id ?? null,
        actorId,
      )
      .run();
  }
  const after = await getBlogPost(input.slug, input.locale);
  await auditLog(actorId, before ? "update" : "create", "blog_posts", `${input.slug}:${input.locale}`, before, after);

  // AI-localization hook (Phase 8): on VI save with any translatable field
  // touched, recompute source hash → mark dependent translations stale; then
  // auto-create drafts for any en/zh locale missing a row. Best-effort.
  if (
    after &&
    after.locale === "vi" &&
    (input.title !== undefined ||
      input.excerpt !== undefined ||
      input.category !== undefined ||
      input.seo_title !== undefined ||
      input.seo_description !== undefined)
  ) {
    try {
      const { onBlogPostSourceChanged, autoTranslateMissingLocales } = await import(
        "@/features/translations"
      );
      await onBlogPostSourceChanged(after.id, {
        title: after.title,
        excerpt: after.excerpt,
        category: after.category,
        seo_title: after.seo_title,
        seo_description: after.seo_description,
      });
      await autoTranslateMissingLocales(actorId, "blog_post", after.id);
    } catch (err) {
      console.error("[blog_posts] onBlogPostSourceChanged failed", err);
    }
  }

  return after!;
}

// Upsert thumbnail by URL — idempotent. Updates blog_posts.thumbnail_media_id.
export async function setBlogThumbnailFromUrl(
  actorId: number,
  input: { slug: string; locale: BlogLocale; url: string; alt_text: string },
): Promise<BlogPostRow> {
  let media = await getDb()
    .prepare(`SELECT id FROM media WHERE r2_key = ? LIMIT 1`)
    .bind(input.url)
    .first<{ id: number }>();
  if (!media) {
    media = await getDb()
      .prepare(
        `INSERT INTO media (r2_key, mime, bytes, alt_text, status, uploaded_by)
           VALUES (?, 'image/external', 0, ?, 'ready', ?) RETURNING id`,
      )
      .bind(input.url, input.alt_text, actorId)
      .first<{ id: number }>();
    if (!media) throw new Error("Không tạo được media row.");
  }
  return upsertBlogPost(actorId, {
    slug: input.slug,
    locale: input.locale,
    title: (await getBlogPost(input.slug, input.locale))?.title ?? "",
    thumbnail_media_id: media.id,
  });
}

// Replace ALL slides for a post. Caller passes ordered list of {url, alt_text}.
// Each URL is upserted into media table as r2_key (external URL convention).
export async function replaceBlogSlides(
  actorId: number,
  input: { slug: string; locale: BlogLocale; slides: { url: string; alt_text: string }[] },
): Promise<BlogSlideRow[]> {
  const post = await getDb()
    .prepare(`SELECT id FROM blog_posts WHERE slug = ? AND locale = ? LIMIT 1`)
    .bind(input.slug, input.locale)
    .first<{ id: number }>();
  if (!post) throw Object.assign(new Error("Blog post không tồn tại."), { statusCode: 404 });

  const before = await getBlogSlides(post.id);
  await getDb().prepare(`DELETE FROM blog_slides WHERE post_id = ?`).bind(post.id).run();

  for (let i = 0; i < input.slides.length; i++) {
    const { url, alt_text } = input.slides[i];
    if (!url.trim()) continue;
    let media = await getDb()
      .prepare(`SELECT id FROM media WHERE r2_key = ? LIMIT 1`)
      .bind(url)
      .first<{ id: number }>();
    if (!media) {
      media = await getDb()
        .prepare(
          `INSERT INTO media (r2_key, mime, bytes, alt_text, status, uploaded_by)
             VALUES (?, 'image/external', 0, ?, 'ready', ?) RETURNING id`,
        )
        .bind(url, alt_text, actorId)
        .first<{ id: number }>();
      if (!media) throw new Error("Không tạo được media row.");
    }
    await getDb()
      .prepare(`INSERT INTO blog_slides (post_id, position, media_id, alt_text) VALUES (?, ?, ?, ?)`)
      .bind(post.id, i + 1, media.id, alt_text)
      .run();
  }
  const after = await getBlogSlides(post.id);
  await auditLog(actorId, "update", "blog_slides", `${input.slug}:${input.locale}`, before, after);
  return after;
}

export async function deleteBlogPost(actorId: number, slug: string, locale: BlogLocale): Promise<void> {
  const before = await getBlogPost(slug, locale);
  if (!before) return;
  await getDb().prepare(`DELETE FROM blog_posts WHERE slug = ? AND locale = ?`).bind(slug, locale).run();
  await auditLog(actorId, "delete", "blog_posts", `${slug}:${locale}`, before, null);
}

// Delete all 3 locales for a slug (whole article)
export async function deleteBlogSlug(actorId: number, slug: string): Promise<void> {
  const before = await listBlogPosts();
  const variants = before.filter((p) => p.slug === slug);
  if (variants.length === 0) return;
  await getDb().prepare(`DELETE FROM blog_posts WHERE slug = ?`).bind(slug).run();
  await auditLog(actorId, "delete", "blog_posts", slug, variants, null);
}
