// Content service — read + write functions for landing-page content tables.
// Pure backend logic. No RPC wrapping. Mutations call auditLog() before returning.

import { getDb } from "@/core/db/client";
import { auditLog } from "@/core/db/mutations";

export type Locale = "en" | "vi" | "zh";

// ================================================================
// SERVICES
// ================================================================

export interface ServiceRow {
  id: string;
  position: number;
  icon: string | null;
  status: "draft" | "live" | "archived";
  gallery_json: string | null;
  videos_json: string | null;
  products_json: string | null;
}

export interface ServiceVideo {
  youtube_id: string;
  caption_key?: string;
  caption?: string;
  thumb?: string;
}

export interface ServiceProduct {
  name: string;
  price?: string;
  time?: string;
  origin?: string;
  image?: string; // direct URL (legacy seed)
  media_id?: number; // preferred — references media table
}

export interface ServiceGalleryItem {
  url?: string;
  media_id?: number;
  alt?: string;
}

export interface ServiceWithI18n extends ServiceRow {
  i18n: Record<Locale, ServiceI18nRow | null>;
  bullets: Record<Locale, string[]>;
  gallery: ServiceGalleryItem[];
  videos: ServiceVideo[];
  products: ServiceProduct[];
}

export interface ServiceI18nRow {
  service_id: string;
  locale: Locale;
  name: string;
  tagline: string | null;
  hero_eyebrow: string | null;
  hero_title: string | null;
  hero_sub: string | null;
  cta_text: string | null;
  cta_url: string | null;
  body_md: string | null;
}

function safeJsonArray<T>(s: string | null): T[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

export async function listServices(): Promise<ServiceWithI18n[]> {
  const services =
    (
      await getDb()
        .prepare(
          `SELECT id, position, icon, status, gallery_json, videos_json, products_json FROM services ORDER BY position`,
        )
        .all<ServiceRow>()
    ).results ?? [];

  const i18nRows =
    (await getDb().prepare(`SELECT * FROM services_i18n`).all<ServiceI18nRow>()).results ?? [];

  const bulletRows =
    (
      await getDb()
        .prepare(
          `SELECT service_id, locale, position, text FROM service_bullets ORDER BY service_id, locale, position`,
        )
        .all<{ service_id: string; locale: Locale; position: number; text: string }>()
    ).results ?? [];

  return services.map((s) => {
    const i18n: Record<Locale, ServiceI18nRow | null> = { en: null, vi: null, zh: null };
    for (const row of i18nRows) if (row.service_id === s.id) i18n[row.locale] = row;

    const bullets: Record<Locale, string[]> = { en: [], vi: [], zh: [] };
    for (const b of bulletRows) {
      if (b.service_id === s.id) bullets[b.locale].push(b.text);
    }
    return {
      ...s,
      i18n,
      bullets,
      gallery: safeJsonArray<ServiceGalleryItem>(s.gallery_json),
      videos: safeJsonArray<ServiceVideo>(s.videos_json),
      products: safeJsonArray<ServiceProduct>(s.products_json),
    };
  });
}

export async function updateServiceBase(
  actorId: number,
  input: {
    id: string;
    position?: number;
    icon?: string | null;
    status?: ServiceRow["status"];
    gallery?: ServiceGalleryItem[] | null;
    videos?: ServiceVideo[] | null;
    products?: ServiceProduct[] | null;
  },
): Promise<ServiceRow> {
  const before = await getDb()
    .prepare(
      `SELECT id, position, icon, status, gallery_json, videos_json, products_json FROM services WHERE id = ? LIMIT 1`,
    )
    .bind(input.id)
    .first<ServiceRow>();
  if (!before) throw Object.assign(new Error("Service không tồn tại."), { statusCode: 404 });

  const fields: string[] = [];
  const values: unknown[] = [];
  if (input.position !== undefined) {
    fields.push("position = ?");
    values.push(input.position);
  }
  if (input.icon !== undefined) {
    fields.push("icon = ?");
    values.push(input.icon);
  }
  if (input.status !== undefined) {
    fields.push("status = ?");
    values.push(input.status);
  }
  if (input.gallery !== undefined) {
    fields.push("gallery_json = ?");
    values.push(input.gallery && input.gallery.length > 0 ? JSON.stringify(input.gallery) : null);
  }
  if (input.videos !== undefined) {
    fields.push("videos_json = ?");
    values.push(input.videos && input.videos.length > 0 ? JSON.stringify(input.videos) : null);
  }
  if (input.products !== undefined) {
    fields.push("products_json = ?");
    values.push(
      input.products && input.products.length > 0 ? JSON.stringify(input.products) : null,
    );
  }
  if (fields.length === 0) return before;
  values.push(input.id);

  await getDb()
    .prepare(`UPDATE services SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();
  const after = await getDb()
    .prepare(
      `SELECT id, position, icon, status, gallery_json, videos_json, products_json FROM services WHERE id = ?`,
    )
    .bind(input.id)
    .first<ServiceRow>();
  await auditLog(actorId, "update", "services", input.id, before, after);
  return after!;
}

export async function upsertServiceI18n(
  actorId: number,
  input: {
    service_id: string;
    locale: Locale;
    name: string;
    tagline?: string | null;
    hero_eyebrow?: string | null;
    hero_title?: string | null;
    hero_sub?: string | null;
    cta_text?: string | null;
    cta_url?: string | null;
    body_md?: string | null;
  },
): Promise<ServiceI18nRow> {
  const before = await getDb()
    .prepare(`SELECT * FROM services_i18n WHERE service_id = ? AND locale = ? LIMIT 1`)
    .bind(input.service_id, input.locale)
    .first<ServiceI18nRow>();

  if (before) {
    await getDb()
      .prepare(
        `UPDATE services_i18n
            SET name = ?, tagline = ?, hero_eyebrow = ?, hero_title = ?, hero_sub = ?,
                cta_text = ?, cta_url = ?, body_md = ?
          WHERE service_id = ? AND locale = ?`,
      )
      .bind(
        input.name,
        input.tagline ?? null,
        input.hero_eyebrow ?? null,
        input.hero_title ?? null,
        input.hero_sub ?? null,
        input.cta_text ?? null,
        input.cta_url ?? null,
        input.body_md ?? null,
        input.service_id,
        input.locale,
      )
      .run();
  } else {
    await getDb()
      .prepare(
        `INSERT INTO services_i18n
           (service_id, locale, name, tagline, hero_eyebrow, hero_title, hero_sub, cta_text, cta_url, body_md)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.service_id,
        input.locale,
        input.name,
        input.tagline ?? null,
        input.hero_eyebrow ?? null,
        input.hero_title ?? null,
        input.hero_sub ?? null,
        input.cta_text ?? null,
        input.cta_url ?? null,
        input.body_md ?? null,
      )
      .run();
  }
  const after = await getDb()
    .prepare(`SELECT * FROM services_i18n WHERE service_id = ? AND locale = ?`)
    .bind(input.service_id, input.locale)
    .first<ServiceI18nRow>();
  await auditLog(
    actorId,
    before ? "update" : "create",
    "services_i18n",
    `${input.service_id}:${input.locale}`,
    before,
    after,
  );
  return after!;
}

// Replace ALL bullets for a service+locale. Caller passes the new ordered list.
// This is safer than partial CRUD because reorder/add/remove all collapse to one save.
export async function replaceServiceBullets(
  actorId: number,
  input: { service_id: string; locale: Locale; bullets: string[] },
): Promise<string[]> {
  const before =
    (
      await getDb()
        .prepare(
          `SELECT text FROM service_bullets WHERE service_id = ? AND locale = ? ORDER BY position`,
        )
        .bind(input.service_id, input.locale)
        .all<{ text: string }>()
    ).results?.map((r) => r.text) ?? [];

  await getDb()
    .prepare(`DELETE FROM service_bullets WHERE service_id = ? AND locale = ?`)
    .bind(input.service_id, input.locale)
    .run();

  for (let i = 0; i < input.bullets.length; i++) {
    const text = input.bullets[i].trim();
    if (!text) continue;
    await getDb()
      .prepare(
        `INSERT INTO service_bullets (service_id, locale, position, text) VALUES (?, ?, ?, ?)`,
      )
      .bind(input.service_id, input.locale, i + 1, text)
      .run();
  }
  await auditLog(
    actorId,
    "update",
    "service_bullets",
    `${input.service_id}:${input.locale}`,
    before,
    input.bullets,
  );
  return input.bullets;
}

// ================================================================
// FAQs
// ================================================================

export interface FaqRow {
  id: number;
  scope: string;
  position: number;
  locale: Locale;
  question: string;
  answer: string;
}

export async function listFaqs(scope: string = "home"): Promise<FaqRow[]> {
  const result = await getDb()
    .prepare(
      `SELECT id, scope, position, locale, question, answer FROM faqs WHERE scope = ? ORDER BY position, locale`,
    )
    .bind(scope)
    .all<FaqRow>();
  return result.results ?? [];
}

/** Lists every FAQ row across all scopes. Used by the admin index so the
 *  operator can browse + edit FAQs for multiple page scopes (home, order,
 *  …) under one screen with scope tabs. */
export async function listAllFaqs(): Promise<FaqRow[]> {
  const result = await getDb()
    .prepare(
      `SELECT id, scope, position, locale, question, answer FROM faqs ORDER BY scope, position, locale`,
    )
    .all<FaqRow>();
  return result.results ?? [];
}

/** Public-facing FAQ list for a single locale. Used by the landing `/faqs`
 *  endpoint to serve translation-gated copy.
 *
 *  - `lang='vi'` → returns VI rows from `faqs` directly (canonical source).
 *  - `lang='en'|'zh'` → JOINs `faq_translations` and serves ONLY rows where
 *    `status='reviewed'`. Drafts, stale, and failed translations stay
 *    invisible to the public API per spec §7.1 + Rule 8.
 *
 *  NO cross-locale fallback (spec §7.2 + Rule 15). When a reviewed EN/ZH row
 *  is missing, the row is simply omitted; landing's static i18n.tsx supplies
 *  the default. */
export async function listFaqsForLocale(
  scope: string,
  lang: Locale,
): Promise<Pick<FaqRow, "id" | "position" | "question" | "answer">[]> {
  if (lang === "vi") {
    const result = await getDb()
      .prepare(
        `SELECT id, position, question, answer
           FROM faqs
          WHERE scope = ? AND locale = 'vi'
          ORDER BY position`,
      )
      .bind(scope)
      .all<{ id: number; position: number; question: string; answer: string }>();
    return result.results ?? [];
  }
  const result = await getDb()
    .prepare(
      `SELECT f.id, f.position, t.question, t.answer
         FROM faqs f
         JOIN faq_translations t
           ON t.faq_id = f.id AND t.locale = ? AND t.status = 'reviewed'
        WHERE f.scope = ? AND f.locale = 'vi'
        ORDER BY f.position`,
    )
    .bind(lang, scope)
    .all<{ id: number; position: number; question: string; answer: string }>();
  return result.results ?? [];
}

// ================================================================
// SERVICE BLOCKS (generic per-page card sections)
// ================================================================

export interface ServiceBlockRow {
  id: number;
  page_slug: string;
  kind: string;
  position: number;
  locale: Locale;
  icon: string | null;
  title: string | null;
  description: string | null;
  /** Stringified JSON. Callers parse on the consumer side. */
  payload_json: string;
  created_at: number;
  updated_at: number;
}

/** Public-facing read. Returns blocks for one page+locale, optionally
 *  filtered to a single kind. Sorted by position so renderers can iterate
 *  the result as-is. */
export async function listServiceBlocks(input: {
  page_slug: string;
  locale: Locale;
  kind?: string;
}): Promise<ServiceBlockRow[]> {
  const where: string[] = ["page_slug = ?", "locale = ?"];
  const params: unknown[] = [input.page_slug, input.locale];
  if (input.kind) {
    where.push("kind = ?");
    params.push(input.kind);
  }
  const result = await getDb()
    .prepare(
      `SELECT id, page_slug, kind, position, locale, icon, title, description, payload_json, created_at, updated_at
         FROM service_blocks
        WHERE ${where.join(" AND ")}
        ORDER BY kind, position, id`,
    )
    .bind(...params)
    .all<ServiceBlockRow>();
  return result.results ?? [];
}

/** Public-facing read for a single locale, translation-gated for en/zh.
 *  Mirrors listFaqsForLocale (see that doc) — VI reads from `service_blocks`
 *  directly; EN/ZH JOIN `service_block_translations` filtered by status='reviewed'.
 *  Non-translatable columns (icon, kind, position) come from the VI source row. */
export async function listServiceBlocksForLocale(input: {
  page_slug: string;
  lang: Locale;
  kind?: string;
}): Promise<ServiceBlockRow[]> {
  if (input.lang === "vi") {
    return listServiceBlocks({ page_slug: input.page_slug, locale: "vi", kind: input.kind });
  }
  const where: string[] = ["sb.page_slug = ?", "sb.locale = 'vi'", "t.locale = ?", "t.status = 'reviewed'"];
  const params: unknown[] = [input.page_slug, input.lang];
  if (input.kind) {
    where.push("sb.kind = ?");
    params.push(input.kind);
  }
  const result = await getDb()
    .prepare(
      `SELECT sb.id, sb.page_slug, sb.kind, sb.position, ? AS locale,
              sb.icon, t.title, t.description, t.payload_json,
              sb.created_at, t.updated_at
         FROM service_blocks sb
         JOIN service_block_translations t ON t.service_block_id = sb.id
        WHERE ${where.join(" AND ")}
        ORDER BY sb.kind, sb.position, sb.id`,
    )
    .bind(input.lang, ...params)
    .all<ServiceBlockRow>();
  return result.results ?? [];
}

/** Admin read — every row, every locale. Used by the management screen. */
export async function listAllServiceBlocks(): Promise<ServiceBlockRow[]> {
  const result = await getDb()
    .prepare(
      `SELECT id, page_slug, kind, position, locale, icon, title, description, payload_json, created_at, updated_at
         FROM service_blocks
        ORDER BY page_slug, kind, position, locale`,
    )
    .all<ServiceBlockRow>();
  return result.results ?? [];
}

export async function updateServiceBlock(
  actorId: number,
  input: {
    id: number;
    position?: number;
    icon?: string | null;
    title?: string | null;
    description?: string | null;
    payload_json?: string;
  },
): Promise<ServiceBlockRow> {
  const before = await getDb()
    .prepare(
      `SELECT id, page_slug, kind, position, locale, icon, title, description, payload_json, created_at, updated_at
         FROM service_blocks WHERE id = ? LIMIT 1`,
    )
    .bind(input.id)
    .first<ServiceBlockRow>();
  if (!before) {
    throw Object.assign(new Error("Service block không tồn tại."), { statusCode: 404 });
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  if (input.position !== undefined) {
    fields.push("position = ?");
    values.push(input.position);
  }
  if (input.icon !== undefined) {
    fields.push("icon = ?");
    values.push(input.icon);
  }
  if (input.title !== undefined) {
    fields.push("title = ?");
    values.push(input.title);
  }
  if (input.description !== undefined) {
    fields.push("description = ?");
    values.push(input.description);
  }
  if (input.payload_json !== undefined) {
    fields.push("payload_json = ?");
    values.push(input.payload_json);
  }
  if (fields.length === 0) return before;
  fields.push("updated_at = ?");
  values.push(Math.floor(Date.now() / 1000));
  values.push(input.id);

  await getDb()
    .prepare(`UPDATE service_blocks SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();
  const after = await getDb()
    .prepare(
      `SELECT id, page_slug, kind, position, locale, icon, title, description, payload_json, created_at, updated_at
         FROM service_blocks WHERE id = ?`,
    )
    .bind(input.id)
    .first<ServiceBlockRow>();
  await auditLog(actorId, "update", "service_blocks", input.id, before, after);

  // Spec §3.3 + §11.7: editing a VI source row auto-fires `source_changed`
  // on every dependent translation whose source_hash actually changed.
  // Only the translatable fields (title, description, payload_json) affect
  // the hash — position/icon don't.
  if (
    after &&
    after.locale === "vi" &&
    (input.title !== undefined ||
      input.description !== undefined ||
      input.payload_json !== undefined)
  ) {
    try {
      const { onServiceBlockSourceChanged, autoTranslateMissingLocales } = await import(
        "@/features/translations"
      );
      await onServiceBlockSourceChanged(after.id, {
        title: after.title,
        description: after.description,
        payload_json: after.payload_json,
      });
      await autoTranslateMissingLocales(actorId, "service_block", after.id);
    } catch (err) {
      console.error("[service_blocks] onServiceBlockSourceChanged failed", err);
    }
  }

  return after!;
}

export async function deleteServiceBlock(actorId: number, id: number): Promise<void> {
  const before = await getDb()
    .prepare(
      `SELECT id, page_slug, kind, position, locale, icon, title, description, payload_json, created_at, updated_at
         FROM service_blocks WHERE id = ? LIMIT 1`,
    )
    .bind(id)
    .first<ServiceBlockRow>();
  if (!before) return;
  await getDb().prepare(`DELETE FROM service_blocks WHERE id = ?`).bind(id).run();
  await auditLog(actorId, "delete", "service_blocks", id, before, null);
}

export async function createFaq(
  actorId: number,
  input: { scope: string; position: number; locale: Locale; question: string; answer: string },
): Promise<FaqRow> {
  const inserted = await getDb()
    .prepare(
      `INSERT INTO faqs (scope, position, locale, question, answer)
         VALUES (?, ?, ?, ?, ?)
         RETURNING id, scope, position, locale, question, answer`,
    )
    .bind(input.scope, input.position, input.locale, input.question, input.answer)
    .first<FaqRow>();
  if (!inserted) throw new Error("Không tạo được FAQ.");
  await auditLog(actorId, "create", "faqs", inserted.id, null, inserted);
  return inserted;
}

export async function updateFaq(
  actorId: number,
  input: { id: number; question?: string; answer?: string; position?: number },
): Promise<FaqRow> {
  const before = await getDb()
    .prepare(`SELECT id, scope, position, locale, question, answer FROM faqs WHERE id = ? LIMIT 1`)
    .bind(input.id)
    .first<FaqRow>();
  if (!before) throw Object.assign(new Error("FAQ không tồn tại."), { statusCode: 404 });

  const fields: string[] = [];
  const values: unknown[] = [];
  if (input.question !== undefined) {
    fields.push("question = ?");
    values.push(input.question);
  }
  if (input.answer !== undefined) {
    fields.push("answer = ?");
    values.push(input.answer);
  }
  if (input.position !== undefined) {
    fields.push("position = ?");
    values.push(input.position);
  }
  if (fields.length === 0) return before;
  values.push(input.id);

  await getDb()
    .prepare(`UPDATE faqs SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();
  const after = await getDb()
    .prepare(`SELECT id, scope, position, locale, question, answer FROM faqs WHERE id = ?`)
    .bind(input.id)
    .first<FaqRow>();
  await auditLog(actorId, "update", "faqs", input.id, before, after);

  // Spec §3.3 + §11.7: editing a VI source row auto-fires `source_changed`
  // on every dependent translation whose source_hash has actually changed.
  // ONLY auto-firing transition; everything else is operator-initiated.
  // Wrap in try/catch so a failure here doesn't roll back the FAQ edit
  // itself — the operator sees the row updated, stale propagation happens
  // best-effort. (Audit log still captures the FAQ change above.)
  if (
    after &&
    after.locale === "vi" &&
    (input.question !== undefined || input.answer !== undefined)
  ) {
    try {
      const { onFaqSourceChanged, autoTranslateMissingLocales } = await import("@/features/translations");
      await onFaqSourceChanged(after.id, { question: after.question, answer: after.answer });
      // Auto-create drafts for any locale that has no translation yet.
      // Existing drafts are NOT touched — onFaqSourceChanged already marked
      // them stale. Operator decides via 🤖 whether to re-translate.
      await autoTranslateMissingLocales(actorId, "faq", after.id);
    } catch (err) {
      console.warn(`[faqs] source_changed propagation failed for id=${after.id}:`, err);
    }
  }

  return after!;
}

export async function deleteFaq(actorId: number, id: number): Promise<void> {
  const before = await getDb()
    .prepare(`SELECT id, scope, position, locale, question, answer FROM faqs WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<FaqRow>();
  if (!before) return;
  await getDb().prepare(`DELETE FROM faqs WHERE id = ?`).bind(id).run();
  await auditLog(actorId, "delete", "faqs", id, before, null);
}

// Reorder FAQs within a scope+locale group. orderedIds = new sequence of FAQ ids.
export async function reorderFaqs(
  actorId: number,
  input: { scope: string; locale: Locale; orderedIds: number[] },
): Promise<void> {
  const before =
    (
      await getDb()
        .prepare(`SELECT id, position FROM faqs WHERE scope = ? AND locale = ? ORDER BY position`)
        .bind(input.scope, input.locale)
        .all<{ id: number; position: number }>()
    ).results ?? [];

  for (let i = 0; i < input.orderedIds.length; i++) {
    await getDb()
      .prepare(`UPDATE faqs SET position = ? WHERE id = ? AND scope = ? AND locale = ?`)
      .bind(i + 1, input.orderedIds[i], input.scope, input.locale)
      .run();
  }
  await auditLog(
    actorId,
    "reorder",
    "faqs",
    `${input.scope}:${input.locale}`,
    before,
    input.orderedIds,
  );
}

// ================================================================
// TESTIMONIALS
// ================================================================

export interface TestimonialRow {
  id: number;
  position: number;
  locale: Locale;
  quote: string;
  author_name: string;
  author_role: string | null;
  avatar_media_id: number | null;
}

export async function listTestimonials(): Promise<TestimonialRow[]> {
  const result = await getDb()
    .prepare(
      `SELECT id, position, locale, quote, author_name, author_role, avatar_media_id
         FROM testimonials ORDER BY position, locale`,
    )
    .all<TestimonialRow>();
  return result.results ?? [];
}

/** Public-facing read for a single locale, translation-gated for en/zh.
 *  VI reads from `testimonials` directly. EN/ZH JOIN `testimonial_translations`
 *  filtered by status='reviewed'. author_name and avatar_media_id are
 *  non-translatable and always come from the VI source row. */
export async function listTestimonialsForLocale(lang: Locale): Promise<TestimonialRow[]> {
  if (lang === "vi") {
    const result = await getDb()
      .prepare(
        `SELECT id, position, locale, quote, author_name, author_role, avatar_media_id
           FROM testimonials WHERE locale = 'vi' ORDER BY position`,
      )
      .all<TestimonialRow>();
    return result.results ?? [];
  }
  const result = await getDb()
    .prepare(
      `SELECT ts.id, ts.position, ? AS locale,
              t.quote, ts.author_name, t.author_role, ts.avatar_media_id
         FROM testimonials ts
         JOIN testimonial_translations t ON t.testimonial_id = ts.id
        WHERE ts.locale = 'vi' AND t.locale = ? AND t.status = 'reviewed'
        ORDER BY ts.position`,
    )
    .bind(lang, lang)
    .all<TestimonialRow>();
  return result.results ?? [];
}

export async function createTestimonial(
  actorId: number,
  input: {
    position: number;
    locale: Locale;
    quote: string;
    author_name: string;
    author_role?: string | null;
    avatar_media_id?: number | null;
  },
): Promise<TestimonialRow> {
  const inserted = await getDb()
    .prepare(
      `INSERT INTO testimonials (position, locale, quote, author_name, author_role, avatar_media_id)
         VALUES (?, ?, ?, ?, ?, ?)
         RETURNING id, position, locale, quote, author_name, author_role, avatar_media_id`,
    )
    .bind(
      input.position,
      input.locale,
      input.quote,
      input.author_name,
      input.author_role ?? null,
      input.avatar_media_id ?? null,
    )
    .first<TestimonialRow>();
  if (!inserted) throw new Error("Không tạo được testimonial.");
  await auditLog(actorId, "create", "testimonials", inserted.id, null, inserted);
  return inserted;
}

export async function updateTestimonial(
  actorId: number,
  input: {
    id: number;
    position?: number;
    quote?: string;
    author_name?: string;
    author_role?: string | null;
    avatar_media_id?: number | null;
  },
): Promise<TestimonialRow> {
  const before = await getDb()
    .prepare(
      `SELECT id, position, locale, quote, author_name, author_role, avatar_media_id FROM testimonials WHERE id = ? LIMIT 1`,
    )
    .bind(input.id)
    .first<TestimonialRow>();
  if (!before) throw Object.assign(new Error("Testimonial không tồn tại."), { statusCode: 404 });

  const fields: string[] = [];
  const values: unknown[] = [];
  if (input.position !== undefined) {
    fields.push("position = ?");
    values.push(input.position);
  }
  if (input.quote !== undefined) {
    fields.push("quote = ?");
    values.push(input.quote);
  }
  if (input.author_name !== undefined) {
    fields.push("author_name = ?");
    values.push(input.author_name);
  }
  if (input.author_role !== undefined) {
    fields.push("author_role = ?");
    values.push(input.author_role);
  }
  if (input.avatar_media_id !== undefined) {
    fields.push("avatar_media_id = ?");
    values.push(input.avatar_media_id);
  }
  if (fields.length === 0) return before;
  values.push(input.id);

  await getDb()
    .prepare(`UPDATE testimonials SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();
  const after = await getDb()
    .prepare(
      `SELECT id, position, locale, quote, author_name, author_role, avatar_media_id FROM testimonials WHERE id = ?`,
    )
    .bind(input.id)
    .first<TestimonialRow>();
  await auditLog(actorId, "update", "testimonials", input.id, before, after);

  // Spec §3.3 + §11.7: editing a VI source row auto-fires `source_changed`
  // on every dependent translation whose source_hash has actually changed.
  // Only `quote` and `author_role` are translatable — name + avatar don't
  // affect the translation hash so we only fire when those fields change.
  // Wrap in try/catch so a failure here doesn't roll back the source edit.
  if (
    after &&
    after.locale === "vi" &&
    (input.quote !== undefined || input.author_role !== undefined)
  ) {
    try {
      const { onTestimonialSourceChanged, autoTranslateMissingLocales } = await import(
        "@/features/translations"
      );
      await onTestimonialSourceChanged(after.id, {
        quote: after.quote,
        author_role: after.author_role,
      });
      await autoTranslateMissingLocales(actorId, "testimonial", after.id);
    } catch (err) {
      console.error("[testimonials] onTestimonialSourceChanged failed", err);
    }
  }

  return after!;
}

export async function deleteTestimonial(actorId: number, id: number): Promise<void> {
  const before = await getDb()
    .prepare(
      `SELECT id, position, locale, quote, author_name, author_role, avatar_media_id FROM testimonials WHERE id = ? LIMIT 1`,
    )
    .bind(id)
    .first<TestimonialRow>();
  if (!before) return;
  await getDb().prepare(`DELETE FROM testimonials WHERE id = ?`).bind(id).run();
  await auditLog(actorId, "delete", "testimonials", id, before, null);
}

export async function reorderTestimonials(
  actorId: number,
  input: { locale: Locale; orderedIds: number[] },
): Promise<void> {
  const before =
    (
      await getDb()
        .prepare(`SELECT id, position FROM testimonials WHERE locale = ? ORDER BY position`)
        .bind(input.locale)
        .all<{ id: number; position: number }>()
    ).results ?? [];
  for (let i = 0; i < input.orderedIds.length; i++) {
    await getDb()
      .prepare(`UPDATE testimonials SET position = ? WHERE id = ? AND locale = ?`)
      .bind(i + 1, input.orderedIds[i], input.locale)
      .run();
  }
  await auditLog(actorId, "reorder", "testimonials", input.locale, before, input.orderedIds);
}

// ================================================================
// CONTACT LOCATIONS
// ================================================================

export interface ContactLocationRow {
  id: number;
  position: number;
  kind: "office" | "warehouse" | "phone" | "email" | "website";
  locale: Locale;
  label: string;
  address: string | null;
  phone: string | null;
  url: string | null;
  lang_class: string | null;
}

export async function listContactLocations(): Promise<ContactLocationRow[]> {
  const result = await getDb()
    .prepare(
      `SELECT id, position, kind, locale, label, address, phone, url, lang_class
         FROM contact_locations ORDER BY position, locale`,
    )
    .all<ContactLocationRow>();
  return result.results ?? [];
}

export async function createContactLocation(
  actorId: number,
  input: {
    position: number;
    kind: ContactLocationRow["kind"];
    locale: Locale;
    label: string;
    address?: string | null;
    phone?: string | null;
    url?: string | null;
    lang_class?: string | null;
  },
): Promise<ContactLocationRow> {
  const inserted = await getDb()
    .prepare(
      `INSERT INTO contact_locations (position, kind, locale, label, address, phone, url, lang_class)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id, position, kind, locale, label, address, phone, url, lang_class`,
    )
    .bind(
      input.position,
      input.kind,
      input.locale,
      input.label,
      input.address ?? null,
      input.phone ?? null,
      input.url ?? null,
      input.lang_class ?? null,
    )
    .first<ContactLocationRow>();
  if (!inserted) throw new Error("Không tạo được location.");
  await auditLog(actorId, "create", "contact_locations", inserted.id, null, inserted);
  return inserted;
}

export async function updateContactLocation(
  actorId: number,
  input: {
    id: number;
    position?: number;
    kind?: ContactLocationRow["kind"];
    label?: string;
    address?: string | null;
    phone?: string | null;
    url?: string | null;
    lang_class?: string | null;
  },
): Promise<ContactLocationRow> {
  const before = await getDb()
    .prepare(
      `SELECT id, position, kind, locale, label, address, phone, url, lang_class FROM contact_locations WHERE id = ? LIMIT 1`,
    )
    .bind(input.id)
    .first<ContactLocationRow>();
  if (!before) throw Object.assign(new Error("Location không tồn tại."), { statusCode: 404 });

  const fields: string[] = [];
  const values: unknown[] = [];
  if (input.position !== undefined) {
    fields.push("position = ?");
    values.push(input.position);
  }
  if (input.kind !== undefined) {
    fields.push("kind = ?");
    values.push(input.kind);
  }
  if (input.label !== undefined) {
    fields.push("label = ?");
    values.push(input.label);
  }
  if (input.address !== undefined) {
    fields.push("address = ?");
    values.push(input.address);
  }
  if (input.phone !== undefined) {
    fields.push("phone = ?");
    values.push(input.phone);
  }
  if (input.url !== undefined) {
    fields.push("url = ?");
    values.push(input.url);
  }
  if (input.lang_class !== undefined) {
    fields.push("lang_class = ?");
    values.push(input.lang_class);
  }
  if (fields.length === 0) return before;
  values.push(input.id);

  await getDb()
    .prepare(`UPDATE contact_locations SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();
  const after = await getDb()
    .prepare(
      `SELECT id, position, kind, locale, label, address, phone, url, lang_class FROM contact_locations WHERE id = ?`,
    )
    .bind(input.id)
    .first<ContactLocationRow>();
  await auditLog(actorId, "update", "contact_locations", input.id, before, after);
  return after!;
}

export async function deleteContactLocation(actorId: number, id: number): Promise<void> {
  const before = await getDb()
    .prepare(
      `SELECT id, position, kind, locale, label, address, phone, url, lang_class FROM contact_locations WHERE id = ? LIMIT 1`,
    )
    .bind(id)
    .first<ContactLocationRow>();
  if (!before) return;
  await getDb().prepare(`DELETE FROM contact_locations WHERE id = ?`).bind(id).run();
  await auditLog(actorId, "delete", "contact_locations", id, before, null);
}

export async function reorderContactLocations(
  actorId: number,
  input: { locale: Locale; orderedIds: number[] },
): Promise<void> {
  const before =
    (
      await getDb()
        .prepare(`SELECT id, position FROM contact_locations WHERE locale = ? ORDER BY position`)
        .bind(input.locale)
        .all<{ id: number; position: number }>()
    ).results ?? [];
  for (let i = 0; i < input.orderedIds.length; i++) {
    await getDb()
      .prepare(`UPDATE contact_locations SET position = ? WHERE id = ? AND locale = ?`)
      .bind(i + 1, input.orderedIds[i], input.locale)
      .run();
  }
  await auditLog(actorId, "reorder", "contact_locations", input.locale, before, input.orderedIds);
}

// ================================================================
// INTEGRATIONS (locale-agnostic)
// ================================================================

export interface IntegrationRow {
  id: number;
  position: number;
  name: string;
  logo_media_id: number | null;
  url: string | null;
  color_class: string | null;
}

export async function listIntegrations(): Promise<IntegrationRow[]> {
  const result = await getDb()
    .prepare(
      `SELECT id, position, name, logo_media_id, url, color_class FROM integrations ORDER BY position`,
    )
    .all<IntegrationRow>();
  return result.results ?? [];
}

export async function createIntegration(
  actorId: number,
  input: {
    position: number;
    name: string;
    logo_media_id?: number | null;
    url?: string | null;
    color_class?: string | null;
  },
): Promise<IntegrationRow> {
  const inserted = await getDb()
    .prepare(
      `INSERT INTO integrations (position, name, logo_media_id, url, color_class)
         VALUES (?, ?, ?, ?, ?)
         RETURNING id, position, name, logo_media_id, url, color_class`,
    )
    .bind(
      input.position,
      input.name,
      input.logo_media_id ?? null,
      input.url ?? null,
      input.color_class ?? null,
    )
    .first<IntegrationRow>();
  if (!inserted) throw new Error("Không tạo được integration.");
  await auditLog(actorId, "create", "integrations", inserted.id, null, inserted);
  return inserted;
}

export async function updateIntegration(
  actorId: number,
  input: {
    id: number;
    position?: number;
    name?: string;
    logo_media_id?: number | null;
    url?: string | null;
    color_class?: string | null;
  },
): Promise<IntegrationRow> {
  const before = await getDb()
    .prepare(
      `SELECT id, position, name, logo_media_id, url, color_class FROM integrations WHERE id = ? LIMIT 1`,
    )
    .bind(input.id)
    .first<IntegrationRow>();
  if (!before) throw Object.assign(new Error("Integration không tồn tại."), { statusCode: 404 });

  const fields: string[] = [];
  const values: unknown[] = [];
  if (input.position !== undefined) {
    fields.push("position = ?");
    values.push(input.position);
  }
  if (input.name !== undefined) {
    fields.push("name = ?");
    values.push(input.name);
  }
  if (input.logo_media_id !== undefined) {
    fields.push("logo_media_id = ?");
    values.push(input.logo_media_id);
  }
  if (input.url !== undefined) {
    fields.push("url = ?");
    values.push(input.url);
  }
  if (input.color_class !== undefined) {
    fields.push("color_class = ?");
    values.push(input.color_class);
  }
  if (fields.length === 0) return before;
  values.push(input.id);

  await getDb()
    .prepare(`UPDATE integrations SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();
  const after = await getDb()
    .prepare(
      `SELECT id, position, name, logo_media_id, url, color_class FROM integrations WHERE id = ?`,
    )
    .bind(input.id)
    .first<IntegrationRow>();
  await auditLog(actorId, "update", "integrations", input.id, before, after);
  return after!;
}

export async function deleteIntegration(actorId: number, id: number): Promise<void> {
  const before = await getDb()
    .prepare(
      `SELECT id, position, name, logo_media_id, url, color_class FROM integrations WHERE id = ? LIMIT 1`,
    )
    .bind(id)
    .first<IntegrationRow>();
  if (!before) return;
  await getDb().prepare(`DELETE FROM integrations WHERE id = ?`).bind(id).run();
  await auditLog(actorId, "delete", "integrations", id, before, null);
}

export async function reorderIntegrations(actorId: number, orderedIds: number[]): Promise<void> {
  const before =
    (
      await getDb()
        .prepare(`SELECT id, position FROM integrations ORDER BY position`)
        .all<{ id: number; position: number }>()
    ).results ?? [];
  for (let i = 0; i < orderedIds.length; i++) {
    await getDb()
      .prepare(`UPDATE integrations SET position = ? WHERE id = ?`)
      .bind(i + 1, orderedIds[i])
      .run();
  }
  await auditLog(actorId, "reorder", "integrations", "all", before, orderedIds);
}

// ================================================================
// MARQUEE IMAGES (joined with media)
// ================================================================

export interface MarqueeImageRow {
  id: number;
  position: number;
  media_id: number;
  alt_text: string;
  src: string; // resolved URL (R2 r2_key or external)
}

export async function listMarqueeImages(): Promise<MarqueeImageRow[]> {
  const result = await getDb()
    .prepare(
      `SELECT m.id, m.position, m.media_id, m.alt_text, md.r2_key AS src
         FROM marquee_images m
         JOIN media md ON md.id = m.media_id
         ORDER BY m.position`,
    )
    .all<MarqueeImageRow>();
  return result.results ?? [];
}

// Convenience helper: insert a media row from an external URL (no R2 upload),
// then insert a marquee_images row referencing it. Used by admin "Add by URL" flow
// before Media Library R2 upload UI is built.
export async function createMarqueeImageFromUrl(
  actorId: number,
  input: { position: number; url: string; alt_text: string },
): Promise<MarqueeImageRow> {
  // Skip duplicate URLs — reuse existing media row if r2_key matches.
  const existing = await getDb()
    .prepare(`SELECT id FROM media WHERE r2_key = ? LIMIT 1`)
    .bind(input.url)
    .first<{ id: number }>();
  let mediaId = existing?.id;
  if (!mediaId) {
    const inserted = await getDb()
      .prepare(
        `INSERT INTO media (r2_key, mime, bytes, alt_text, status, uploaded_by)
           VALUES (?, ?, 0, ?, 'ready', ?)
           RETURNING id`,
      )
      .bind(input.url, "image/external", input.alt_text, actorId)
      .first<{ id: number }>();
    if (!inserted) throw new Error("Không tạo được media row.");
    mediaId = inserted.id;
  }
  return createMarqueeImage(actorId, {
    position: input.position,
    media_id: mediaId,
    alt_text: input.alt_text,
  });
}

// Marquee references existing media row. Caller must have created/uploaded media first.
export async function createMarqueeImage(
  actorId: number,
  input: { position: number; media_id: number; alt_text: string },
): Promise<MarqueeImageRow> {
  const inserted = await getDb()
    .prepare(
      `INSERT INTO marquee_images (position, media_id, alt_text)
         VALUES (?, ?, ?)
         RETURNING id`,
    )
    .bind(input.position, input.media_id, input.alt_text)
    .first<{ id: number }>();
  if (!inserted) throw new Error("Không tạo được marquee image.");
  const full = await getDb()
    .prepare(
      `SELECT m.id, m.position, m.media_id, m.alt_text, md.r2_key AS src
         FROM marquee_images m JOIN media md ON md.id = m.media_id WHERE m.id = ?`,
    )
    .bind(inserted.id)
    .first<MarqueeImageRow>();
  await auditLog(actorId, "create", "marquee_images", inserted.id, null, full);
  return full!;
}

export async function updateMarqueeImage(
  actorId: number,
  input: { id: number; position?: number; media_id?: number; alt_text?: string },
): Promise<MarqueeImageRow> {
  const before = await getDb()
    .prepare(`SELECT id, position, media_id, alt_text FROM marquee_images WHERE id = ? LIMIT 1`)
    .bind(input.id)
    .first<{ id: number; position: number; media_id: number; alt_text: string }>();
  if (!before) throw Object.assign(new Error("Marquee image không tồn tại."), { statusCode: 404 });

  const fields: string[] = [];
  const values: unknown[] = [];
  if (input.position !== undefined) {
    fields.push("position = ?");
    values.push(input.position);
  }
  if (input.media_id !== undefined) {
    fields.push("media_id = ?");
    values.push(input.media_id);
  }
  if (input.alt_text !== undefined) {
    fields.push("alt_text = ?");
    values.push(input.alt_text);
  }
  if (fields.length === 0) {
    const full = await getDb()
      .prepare(
        `SELECT m.id, m.position, m.media_id, m.alt_text, md.r2_key AS src
           FROM marquee_images m JOIN media md ON md.id = m.media_id WHERE m.id = ?`,
      )
      .bind(input.id)
      .first<MarqueeImageRow>();
    return full!;
  }
  values.push(input.id);

  await getDb()
    .prepare(`UPDATE marquee_images SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();
  const after = await getDb()
    .prepare(
      `SELECT m.id, m.position, m.media_id, m.alt_text, md.r2_key AS src
         FROM marquee_images m JOIN media md ON md.id = m.media_id WHERE m.id = ?`,
    )
    .bind(input.id)
    .first<MarqueeImageRow>();
  await auditLog(actorId, "update", "marquee_images", input.id, before, after);
  return after!;
}

export async function deleteMarqueeImage(actorId: number, id: number): Promise<void> {
  const before = await getDb()
    .prepare(`SELECT id, position, media_id, alt_text FROM marquee_images WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<{ id: number; position: number; media_id: number; alt_text: string }>();
  if (!before) return;
  await getDb().prepare(`DELETE FROM marquee_images WHERE id = ?`).bind(id).run();
  await auditLog(actorId, "delete", "marquee_images", id, before, null);
}

export async function reorderMarqueeImages(actorId: number, orderedIds: number[]): Promise<void> {
  const before =
    (
      await getDb()
        .prepare(`SELECT id, position FROM marquee_images ORDER BY position`)
        .all<{ id: number; position: number }>()
    ).results ?? [];
  for (let i = 0; i < orderedIds.length; i++) {
    await getDb()
      .prepare(`UPDATE marquee_images SET position = ? WHERE id = ?`)
      .bind(i + 1, orderedIds[i])
      .run();
  }
  await auditLog(actorId, "reorder", "marquee_images", "all", before, orderedIds);
}
