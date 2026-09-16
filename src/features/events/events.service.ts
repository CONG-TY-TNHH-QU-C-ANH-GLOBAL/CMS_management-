// Events service — sự kiện / webinar THG tổ chức hoặc tham gia.
//
// Localization shape: ONE ROW PER LOCALE, keyed by (slug, locale) — the same
// shape blog_posts uses, not the side-table shape (careers, policies). A slug
// therefore names a *group* of up to three rows; the admin list groups by slug
// and the editor edits one locale at a time. Migration 0043 owns the table.
//
// Photos live in `event_photos` rather than a JSON column so a photo can be
// reordered or captioned without rewriting the event row (see 0043 header).

import { getDb } from "@/core/db/client";
import { auditLog } from "@/core/db/mutations";

export type EventLocale = "en" | "vi" | "zh";
export const EVENT_LOCALES: readonly EventLocale[] = ["en", "vi", "zh"];

/** 'archived' exists in the table CHECK but the admin UI only offers draft/live:
 *  an archived row reads as deleted to every consumer, and the module already
 *  has a delete. Kept in the type so a hand-written row still parses. */
export type EventStatus = "draft" | "live" | "archived";

export interface EventPhotoRow {
  id: number;
  media_id: number | null;
  position: number;
  caption: string | null;
  r2_key: string | null;
}

export interface EventRow {
  id: number;
  slug: string;
  locale: EventLocale;
  title: string;
  summary: string | null;
  body_md: string | null;
  cover_media_id: number | null;
  og_image_id: number | null;
  event_date: string;
  end_date: string | null;
  location: string | null;
  role: string | null;
  url: string | null;
  video_url: string | null;
  status: EventStatus;
  seo_title: string | null;
  seo_description: string | null;
  updated_at: number;
}

/** Columns the PUBLIC endpoints project. Deliberately narrower than the admin
 *  set — status and updated_at are operator bookkeeping and must not ship in a
 *  public body (the public-surface gate asserts this). */
const PUBLIC_COLUMNS =
  "id, slug, locale, title, summary, body_md, cover_media_id, og_image_id, event_date, end_date, location, role, url, video_url, seo_title, seo_description";

const ADMIN_COLUMNS = `${PUBLIC_COLUMNS}, status, updated_at`;

/** Fields an update may set. Single source of truth for the UPDATE builder, so
 *  adding a column to the editor cannot silently skip the persistence layer. */
const WRITABLE = [
  "title",
  "summary",
  "body_md",
  "cover_media_id",
  "og_image_id",
  "event_date",
  "end_date",
  "location",
  "role",
  "url",
  "video_url",
  "status",
  "seo_title",
  "seo_description",
] as const;

export type EventWritableField = (typeof WRITABLE)[number];

/** Fields whose edit invalidates a translation. Must stay in step with
 *  ENTITY_CONFIG.event.fieldColumns in translations.service.ts — a field
 *  translated there but missing here would leave stale copy served as current. */
const TRANSLATED_FIELDS = [
  "title",
  "summary",
  "body_md",
  "location",
  "role",
  "seo_title",
  "seo_description",
] as const satisfies readonly EventWritableField[];

// ── Public reads (unchanged contract — /api/v1/events consumes these) ────────

export async function listLiveEvents(locale: EventLocale): Promise<EventRow[]> {
  const result = await getDb()
    .prepare(
      `SELECT ${PUBLIC_COLUMNS} FROM events WHERE locale = ? AND status = 'live' ORDER BY event_date DESC, id DESC`,
    )
    .bind(locale)
    .all<EventRow>();
  return result.results ?? [];
}

export async function getLiveEvent(slug: string, locale: EventLocale): Promise<EventRow | null> {
  return getDb()
    .prepare(
      `SELECT ${PUBLIC_COLUMNS} FROM events WHERE slug = ? AND locale = ? AND status = 'live' LIMIT 1`,
    )
    .bind(slug, locale)
    .first<EventRow>();
}

/** The vi row JOINed to a reviewed translation, projected in EXACTLY the order
 *  of PUBLIC_COLUMNS.
 *
 *  The order is load-bearing, not cosmetic: `listLiveEventsForPublic` UNIONs this
 *  against a plain `SELECT ${PUBLIC_COLUMNS}`, and SQL matches UNION branches by
 *  POSITION, not by name. A column added to one list and not the other, or added
 *  in a different place, silently shifts every value after it into the wrong
 *  field — a slug rendering as a media id, with no error anywhere.
 *
 *  `t.*` is the prose the translation owns; `e.*` is everything identical across
 *  languages — dates, links, media ids. */
const TRANSLATED_ROW_SELECT = `e.id, e.slug, ? AS locale, t.title, t.summary, t.body_md,
  e.cover_media_id, e.og_image_id, e.event_date, e.end_date, t.location, t.role,
  e.url, e.video_url, t.seo_title, t.seo_description`;

/** Public read for one locale, with the same precedence getBlogPostForPublic
 *  uses and for the same reason: `vi` is the source of truth, `en`/`zh` are
 *  served from a REVIEWED translation of the vi row, and a hand-written
 *  per-locale row is the fallback for anything translated before the pipeline
 *  existed (or deliberately written by hand).
 *
 *  Status is taken from the VI row: publishing is an editorial decision about
 *  the event, not about one language of it. */
export async function getLiveEventForPublic(
  slug: string,
  locale: EventLocale,
): Promise<EventRow | null> {
  if (locale === "vi") return getLiveEvent(slug, "vi");

  const translated = await getDb()
    .prepare(
      `SELECT ${TRANSLATED_ROW_SELECT}
         FROM events e
         JOIN event_translations t
           ON t.event_id = e.id AND t.locale = ? AND t.status = 'reviewed'
        WHERE e.slug = ? AND e.locale = 'vi' AND e.status = 'live' LIMIT 1`,
    )
    .bind(locale, locale, slug)
    .first<EventRow>();
  if (translated) return translated;
  return getLiveEvent(slug, locale);
}

/** List counterpart. A slug appears once per locale: either as its own live row
 *  or as a reviewed translation of the vi row, never both — the UNION filters
 *  out vi-backed slugs that already have a hand-written row for this locale. */
export async function listLiveEventsForPublic(locale: EventLocale): Promise<EventRow[]> {
  if (locale === "vi") return listLiveEvents("vi");

  const result = await getDb()
    .prepare(
      `SELECT ${TRANSLATED_ROW_SELECT}
         FROM events e
         JOIN event_translations t
           ON t.event_id = e.id AND t.locale = ? AND t.status = 'reviewed'
        WHERE e.locale = 'vi' AND e.status = 'live'
          AND NOT EXISTS (
            SELECT 1 FROM events own
             WHERE own.slug = e.slug AND own.locale = ? AND own.status = 'live'
          )
        UNION ALL
        SELECT ${PUBLIC_COLUMNS} FROM events
         WHERE locale = ? AND status = 'live'
        ORDER BY event_date DESC, id DESC`,
    )
    .bind(locale, locale, locale, locale)
    .all<EventRow>();
  return result.results ?? [];
}

/** Which locales a slug can actually be read in — the `available_locales` the
 *  blog detail endpoint already publishes, so the landing can offer a language
 *  switch that only lists languages with real content. */
export async function availableEventLocales(slug: string): Promise<EventLocale[]> {
  const out: EventLocale[] = [];
  for (const locale of EVENT_LOCALES) {
    if (await getLiveEventForPublic(slug, locale)) out.push(locale);
  }
  return out;
}

// ── Admin reads ─────────────────────────────────────────────────────────────

/** Every row, every locale, every status. The list page groups these by slug. */
export async function listEvents(): Promise<EventRow[]> {
  const result = await getDb()
    .prepare(`SELECT ${ADMIN_COLUMNS} FROM events ORDER BY event_date DESC, slug, locale`)
    .all<EventRow>();
  return result.results ?? [];
}

export async function getEvent(slug: string, locale: EventLocale): Promise<EventRow | null> {
  return getDb()
    .prepare(`SELECT ${ADMIN_COLUMNS} FROM events WHERE slug = ? AND locale = ? LIMIT 1`)
    .bind(slug, locale)
    .first<EventRow>();
}

export async function listEventPhotos(eventId: number): Promise<EventPhotoRow[]> {
  const result = await getDb()
    .prepare(
      `SELECT p.id, p.media_id, p.position, p.caption, m.r2_key
         FROM event_photos p
         LEFT JOIN media m ON m.id = p.media_id
        WHERE p.event_id = ?
        ORDER BY p.position, p.id`,
    )
    .bind(eventId)
    .all<EventPhotoRow>();
  return result.results ?? [];
}

// ── Writes ──────────────────────────────────────────────────────────────────

export interface EventInput {
  slug: string;
  locale: EventLocale;
  title: string;
  summary?: string | null;
  body_md?: string | null;
  cover_media_id?: number | null;
  og_image_id?: number | null;
  event_date: string;
  end_date?: string | null;
  location?: string | null;
  role?: string | null;
  url?: string | null;
  video_url?: string | null;
  status?: EventStatus;
  seo_title?: string | null;
  seo_description?: string | null;
}

export async function createEvent(actorId: number, input: EventInput): Promise<EventRow> {
  const existing = await getEvent(input.slug, input.locale);
  if (existing) {
    throw Object.assign(
      new Error(`Đã có Event "${input.slug}" cho ngôn ngữ ${input.locale.toUpperCase()}.`),
      { statusCode: 409 },
    );
  }
  const inserted = await getDb()
    .prepare(
      `INSERT INTO events
         (slug, locale, title, summary, body_md, cover_media_id, og_image_id, event_date, end_date,
          location, role, url, video_url, status, seo_title, seo_description, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), ?)
       RETURNING ${ADMIN_COLUMNS}`,
    )
    .bind(
      input.slug,
      input.locale,
      input.title,
      input.summary ?? null,
      input.body_md ?? null,
      input.cover_media_id ?? null,
      input.og_image_id ?? null,
      input.event_date,
      input.end_date ?? null,
      input.location ?? null,
      input.role ?? null,
      input.url ?? null,
      input.video_url ?? null,
      input.status ?? "draft",
      input.seo_title ?? null,
      input.seo_description ?? null,
      actorId,
    )
    .first<EventRow>();
  if (!inserted) throw new Error("Không tạo được Event.");
  await auditLog(actorId, "create", "events", inserted.id, null, inserted);
  return inserted;
}

export type UpdateEventInput = { id: number } & Partial<Pick<EventInput, EventWritableField>>;

export async function updateEvent(actorId: number, input: UpdateEventInput): Promise<EventRow> {
  const db = getDb();
  const before = await db
    .prepare(`SELECT ${ADMIN_COLUMNS} FROM events WHERE id = ? LIMIT 1`)
    .bind(input.id)
    .first<EventRow>();
  if (!before) throw Object.assign(new Error("Không tìm thấy Event."), { statusCode: 404 });

  const fields: string[] = [];
  const values: unknown[] = [];
  for (const key of WRITABLE) {
    const value = input[key];
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    values.push(value);
  }
  if (fields.length === 0) return before;

  fields.push("updated_at = unixepoch()", "updated_by = ?");
  values.push(actorId, input.id);
  await db
    .prepare(`UPDATE events SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();

  const after = await db
    .prepare(`SELECT ${ADMIN_COLUMNS} FROM events WHERE id = ?`)
    .bind(input.id)
    .first<EventRow>();
  await auditLog(actorId, "update", "events", input.id, before, after);

  // Editing the VI source invalidates its translations: any reviewed EN/ZH copy
  // now describes older text. Mark them stale so the review queue shows the work,
  // then kick the auto-translator for locales that have none yet. Mirrors
  // blog.service — and, like there, a translation-pipeline failure must never
  // fail the edit the operator just made.
  if (
    after &&
    after.locale === "vi" &&
    TRANSLATED_FIELDS.some((field) => input[field] !== undefined)
  ) {
    try {
      const { onEventSourceChanged, autoTranslateMissingLocales } =
        await import("@/features/translations");
      await onEventSourceChanged(after.id, {
        title: after.title,
        summary: after.summary,
        body_md: after.body_md,
        location: after.location,
        role: after.role,
        seo_title: after.seo_title,
        seo_description: after.seo_description,
      });
      await autoTranslateMissingLocales(actorId, "event", after.id);
    } catch (err) {
      console.error("[events] onEventSourceChanged failed", err);
    }
  }

  return after!;
}

/** Delete ONE locale variant. The schema declares ON DELETE CASCADE for
 *  event_photos, but D1 does not persist PRAGMA foreign_keys — referential
 *  integrity is application-side here (repo convention, migration 0035 header),
 *  so the child rows are removed explicitly. */
export async function deleteEvent(actorId: number, id: number): Promise<void> {
  const db = getDb();
  const before = await db
    .prepare(`SELECT ${ADMIN_COLUMNS} FROM events WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<EventRow>();
  if (!before) return;
  await db.prepare(`DELETE FROM event_photos WHERE event_id = ?`).bind(id).run();
  await db.prepare(`DELETE FROM events WHERE id = ?`).bind(id).run();
  await auditLog(actorId, "delete", "events", id, before, null);
}

/** Delete every locale variant of a slug — what the list page's delete means. */
export async function deleteEventSlug(actorId: number, slug: string): Promise<number> {
  const db = getDb();
  const rows =
    (await db.prepare(`SELECT id FROM events WHERE slug = ?`).bind(slug).all<{ id: number }>())
      .results ?? [];
  for (const row of rows) await deleteEvent(actorId, row.id);
  return rows.length;
}

// ── Photo gallery ───────────────────────────────────────────────────────────

/** Replace the whole gallery in one call. Captions travel with their media id
 *  so reordering in the picker keeps each caption attached to its own photo. */
export async function replaceEventPhotos(
  actorId: number,
  eventId: number,
  photos: { media_id: number; caption?: string | null }[],
): Promise<EventPhotoRow[]> {
  const db = getDb();
  const event = await db
    .prepare(`SELECT id FROM events WHERE id = ? LIMIT 1`)
    .bind(eventId)
    .first<{ id: number }>();
  if (!event) throw Object.assign(new Error("Không tìm thấy Event."), { statusCode: 404 });

  const before = await listEventPhotos(eventId);
  await db.prepare(`DELETE FROM event_photos WHERE event_id = ?`).bind(eventId).run();
  for (let position = 0; position < photos.length; position++) {
    await db
      .prepare(
        `INSERT INTO event_photos (event_id, media_id, position, caption) VALUES (?, ?, ?, ?)`,
      )
      .bind(eventId, photos[position].media_id, position, photos[position].caption ?? null)
      .run();
  }
  await db
    .prepare(`UPDATE events SET updated_at = unixepoch(), updated_by = ? WHERE id = ?`)
    .bind(actorId, eventId)
    .run();
  const after = await listEventPhotos(eventId);
  await auditLog(actorId, "update", "event_photos", eventId, before, after);
  return after;
}
