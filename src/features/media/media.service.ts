// Media library — R2-backed image/video uploads with D1 metadata.
//
// R2 binding `MEDIA` stores blobs; D1 table `media` stores metadata
// (mime, bytes, dimensions, alt_text, tag, public URL). Public reads go
// through `/api/v1/media/<r2_key>` which proxies R2 with cache headers,
// so we don't expose a raw R2 bucket URL.

import { getDb } from "@/core/db/client";
import { auditLog, bumpCmsRev } from "@/core/db/mutations";

export type MediaStatus = "pending" | "ready" | "archived";

export interface MediaRow {
  id: number;
  r2_key: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  alt_text: string;
  status: MediaStatus;
  uploaded_by: number | null;
  created_at: number;
  url: string | null;
  thumb_url: string | null;
  tag: string | null;
  title: string | null;
}

export interface ListMediaInput {
  tag?: string | null;
  status?: MediaStatus | null;
  search?: string | null;
  limit?: number;
  offset?: number;
}

export async function listMedia(input: ListMediaInput = {}): Promise<{
  rows: MediaRow[];
  total: number;
}> {
  const limit = Math.max(1, Math.min(100, input.limit ?? 24));
  const offset = Math.max(0, input.offset ?? 0);

  const where: string[] = [];
  const params: unknown[] = [];
  if (input.tag) {
    where.push("tag = ?");
    params.push(input.tag);
  }
  if (input.status) {
    where.push("status = ?");
    params.push(input.status);
  } else {
    // Default exclude archived from listings
    where.push("status != 'archived'");
  }
  if (input.search) {
    where.push("(alt_text LIKE ? OR title LIKE ? OR r2_key LIKE ?)");
    const like = `%${input.search}%`;
    params.push(like, like, like);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const totalRes = await getDb()
    .prepare(`SELECT COUNT(*) AS c FROM media ${whereSql}`)
    .bind(...params)
    .first<{ c: number }>();
  const total = totalRes?.c ?? 0;

  const rowsRes = await getDb()
    .prepare(
      `SELECT * FROM media ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(...params, limit, offset)
    .all<MediaRow>();

  return { rows: rowsRes.results ?? [], total };
}

export async function getMedia(id: number): Promise<MediaRow | null> {
  return await getDb()
    .prepare(`SELECT * FROM media WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<MediaRow>();
}

export async function listMediaByIds(ids: number[]): Promise<MediaRow[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const res = await getDb()
    .prepare(`SELECT * FROM media WHERE id IN (${placeholders})`)
    .bind(...ids)
    .all<MediaRow>();
  return res.results ?? [];
}

export async function listTags(): Promise<string[]> {
  const res = await getDb()
    .prepare(`SELECT DISTINCT tag FROM media WHERE tag IS NOT NULL AND tag != '' ORDER BY tag`)
    .all<{ tag: string }>();
  return (res.results ?? []).map((r) => r.tag);
}

// ────────────── mutations ──────────────

export interface UploadMediaInput {
  filename: string;
  mime: string;
  bytes: number;
  body: ArrayBuffer | Uint8Array | ReadableStream;
  alt_text: string;
  tag?: string | null;
  title?: string | null;
  width?: number | null;
  height?: number | null;
}

function slugifyFilename(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9.\-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80);
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 12);
}

export async function uploadMedia(actorId: number, input: UploadMediaInput): Promise<MediaRow> {
  const { env } = await import("cloudflare:workers");

  const ext = input.filename.includes(".") ? input.filename.split(".").pop() : "bin";
  const safeName = slugifyFilename(input.filename.replace(/\.[^.]+$/, ""));
  const tag = input.tag?.trim() || "misc";
  const r2_key = `${tag}/${shortId()}-${safeName}.${ext}`;
  const url = `${env.BASE_URL}/api/v1/media/${encodeURIComponent(r2_key)}`;

  await env.MEDIA.put(r2_key, input.body, {
    httpMetadata: { contentType: input.mime },
  });

  const result = await getDb()
    .prepare(
      `INSERT INTO media (r2_key, mime, bytes, width, height, alt_text, status, uploaded_by, tag, title, url)
         VALUES (?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?)`,
    )
    .bind(
      r2_key,
      input.mime,
      input.bytes,
      input.width ?? null,
      input.height ?? null,
      input.alt_text,
      actorId,
      tag,
      input.title?.trim() || null,
      url,
    )
    .run();

  const row = await getMedia(result.meta.last_row_id as number);
  await auditLog(actorId, "create", "media", row?.id ?? null, null, row);
  await bumpCmsRev();
  return row!;
}

export interface UpdateMediaMetaInput {
  alt_text?: string;
  tag?: string | null;
  title?: string | null;
  status?: MediaStatus;
}

export async function updateMediaMeta(
  actorId: number,
  id: number,
  input: UpdateMediaMetaInput,
): Promise<MediaRow> {
  const before = await getMedia(id);
  if (!before) throw new Error(`Media ${id} not found`);

  const fields: string[] = [];
  const values: unknown[] = [];
  if (input.alt_text !== undefined) {
    fields.push("alt_text = ?");
    values.push(input.alt_text);
  }
  if (input.tag !== undefined) {
    fields.push("tag = ?");
    values.push(input.tag);
  }
  if (input.title !== undefined) {
    fields.push("title = ?");
    values.push(input.title);
  }
  if (input.status !== undefined) {
    fields.push("status = ?");
    values.push(input.status);
  }
  if (fields.length === 0) return before;
  values.push(id);

  await getDb()
    .prepare(`UPDATE media SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();

  const after = await getMedia(id);
  await auditLog(actorId, "update", "media", id, before, after);
  await bumpCmsRev();
  return after!;
}

export async function deleteMedia(actorId: number, id: number): Promise<void> {
  const { env } = await import("cloudflare:workers");
  const before = await getMedia(id);
  if (!before) return;

  // HARD delete — remove the D1 row entirely and purge the R2 object.
  // Caller is responsible for ensuring nothing references this media_id
  // (services.gallery_json, blog thumbnails, etc.). Soft archive would
  // preserve references but operator explicitly asked for hard delete.
  await getDb().prepare(`DELETE FROM media WHERE id = ?`).bind(id).run();

  // Best-effort R2 purge — ignore errors so a missing object doesn't break delete
  try { await env.MEDIA.delete(before.r2_key); } catch { /* ignore */ }

  await auditLog(actorId, "delete", "media", id, before, null);
  await bumpCmsRev();
}

/**
 * Nuke the entire media library. Used by the admin "Xóa toàn bộ" button when
 * operator wants to clean out a polluted seed (e.g. dead external URLs that
 * were imported as placeholder rows). Returns the count of deleted rows.
 *
 * Also tries to purge each R2 object — best-effort, errors swallowed so one
 * missing object doesn't block the bulk wipe.
 */
export async function deleteAllMedia(actorId: number): Promise<number> {
  const { env } = await import("cloudflare:workers");
  const all = await getDb().prepare(`SELECT id, r2_key FROM media`).all<{ id: number; r2_key: string }>();
  const rows = all.results ?? [];
  if (rows.length === 0) return 0;

  // Purge R2 first so even if D1 delete fails we don't leak storage
  for (const r of rows) {
    try { await env.MEDIA.delete(r.r2_key); } catch { /* ignore */ }
  }
  await getDb().prepare(`DELETE FROM media`).run();
  await auditLog(actorId, "delete", "media", "ALL", { count: rows.length }, null);
  await bumpCmsRev();
  return rows.length;
}

// ────────────── R2 read proxy ──────────────

export async function readMediaObject(r2_key: string): Promise<{
  body: ReadableStream;
  contentType: string;
  size: number;
} | null> {
  const { env } = await import("cloudflare:workers");
  const obj = await env.MEDIA.get(r2_key);
  if (!obj) return null;
  return {
    body: obj.body,
    contentType: obj.httpMetadata?.contentType ?? "application/octet-stream",
    size: obj.size,
  };
}
