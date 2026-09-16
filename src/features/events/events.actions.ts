// Server functions for the Event admin module (/admin/content/events).
//
// Same shape as partners.actions.ts / leadership.actions.ts: validate with zod,
// import the service lazily inside the handler (the service reaches D1, which
// only exists in the Worker runtime), require a session role, bump the CMS rev
// so the public edge cache and the landing prerender both go stale.
//
// Role split matches the rest of the CMS: viewer reads, editor writes, admin
// deletes.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type { EventLocale, EventPhotoRow, EventRow, EventStatus } from "./events.service";

const ID = z.number().int().positive();
const LOCALE = z.enum(["en", "vi", "zh"]);
const STATUS = z.enum(["draft", "live"]);

/** ISO-8601 calendar date. The column is TEXT and every consumer compares these
 *  as strings, so the format is the contract, not a display preference — see the
 *  migration 0043 header. */
const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải theo định dạng YYYY-MM-DD.");

const SLUG = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Đường dẫn chỉ gồm chữ thường, số và dấu gạch ngang.");

/** Optional free text that stores NULL rather than "" when the operator clears
 *  the field — an empty string would render as an empty paragraph on the
 *  landing, while NULL is the "not set" the components already branch on. */
const text = (max: number) => z.string().max(max).nullable().optional();
const link = z.string().url().max(500).nullable().optional();

export const listEventsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { listEvents } = await import("./events.service");
  await requireSession("viewer");
  return { events: await listEvents() };
});

/** Cover images ship as a resolved URL, not a bare `cover_media_id`: the editor
 *  runs in the browser and has no way to turn a media id into a src. Same reason
 *  the public /api/v1/events handler resolves it. Relative on purpose — the CMS
 *  admin is served by this same Worker, so `/api/v1/media/…` is correct on both
 *  localhost and prod without threading an origin through. */
export const getEventDetailFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ slug: SLUG, locale: LOCALE }).parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { getEvent, listEventPhotos } = await import("./events.service");
    const { getMedia } = await import("@/features/media");
    const { toMediaUrl } = await import("@/features/partners/partners.media");
    await requireSession("viewer");
    const event = await getEvent(data.slug, data.locale);
    if (!event) return { event: null, photos: [], cover_url: null };
    const cover = event.cover_media_id ? await getMedia(event.cover_media_id) : null;
    return {
      event,
      photos: await listEventPhotos(event.id),
      cover_url: cover ? toMediaUrl(cover.r2_key, "") : null,
    };
  });

const eventCreate = z.object({
  slug: SLUG,
  locale: LOCALE,
  title: z.string().min(1).max(200),
  summary: text(500),
  body_md: text(60_000),
  cover_media_id: ID.nullable().optional(),
  event_date: ISO_DATE,
  end_date: ISO_DATE.nullable().optional(),
  location: text(200),
  role: text(120),
  url: link,
  video_url: link,
  status: STATUS.optional(),
  seo_title: text(200),
  seo_description: text(300),
});

export const createEventFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => eventCreate.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { createEvent } = await import("./events.service");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    const event = await createEvent(me.id, data);
    await bumpCmsRev();
    return { event };
  });

const eventUpdate = eventCreate.omit({ slug: true, locale: true }).partial().extend({ id: ID });

export const updateEventFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => eventUpdate.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { updateEvent } = await import("./events.service");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    const event = await updateEvent(me.id, data);
    await bumpCmsRev();
    return { event };
  });

/** Delete one locale variant — used by the editor when a translation should go
 *  away without touching the other languages. */
export const deleteEventFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: ID }).parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { deleteEvent } = await import("./events.service");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("admin");
    await deleteEvent(me.id, data.id);
    await bumpCmsRev();
    return { ok: true as const };
  });

/** Delete the whole Event across all three languages — what the trash icon on
 *  the list row means, mirroring deleteBlogSlugFn. */
export const deleteEventSlugFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ slug: SLUG }).parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { deleteEventSlug } = await import("./events.service");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("admin");
    const deleted = await deleteEventSlug(me.id, data.slug);
    await bumpCmsRev();
    return { deleted };
  });

export const replaceEventPhotosFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        eventId: ID,
        photos: z
          .array(z.object({ media_id: ID, caption: z.string().max(300).nullable().optional() }))
          .max(60),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { replaceEventPhotos } = await import("./events.service");
    const { bumpCmsRev } = await import("@/core/db/mutations");
    const me = await requireSession("editor");
    const photos = await replaceEventPhotos(me.id, data.eventId, data.photos);
    await bumpCmsRev();
    return { photos };
  });
