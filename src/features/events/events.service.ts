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
  "id, slug, locale, title, summary, body_md, cover_media_id, event_date, end_date, location, role, url, video_url, seo_title, seo_description";

const ADMIN_COLUMNS = `${PUBLIC_COLUMNS}, status, updated_at`;

/** Fields an update may set. Single source of truth for the UPDATE builder, so
 *  adding a column to the editor cannot silently skip the persistence layer. */
const WRITABLE = [
  "title",
  "summary",
  "body_md",
  "cover_media_id",
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
         (slug, locale, title, summary, body_md, cover_media_id, event_date, end_date,
          location, role, url, video_url, status, seo_title, seo_description, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), ?)
       RETURNING ${ADMIN_COLUMNS}`,
    )
    .bind(
      input.slug,
      input.locale,
      input.title,
      input.summary ?? null,
      input.body_md ?? null,
      input.cover_media_id ?? null,
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
