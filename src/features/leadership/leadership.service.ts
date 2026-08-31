import { getDb } from "@/core/db/client";
import { auditLog } from "@/core/db/mutations";

export type LeadershipStatus = "draft" | "live";

export interface LeadershipAvatarRow {
  media_id: number;
  position: number;
  r2_key: string;
  alt_text: string;
}

export interface LeadershipRow {
  id: number;
  position: number;
  name: string;
  role: string | null;
  quote: string | null;
  status: LeadershipStatus;
  updated_at: number;
  avatars: LeadershipAvatarRow[];
}

const COLUMNS = `id, position, name, role, quote, status, updated_at`;

async function hydrateAvatars(rows: Omit<LeadershipRow, "avatars">[]): Promise<LeadershipRow[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const placeholders = ids.map(() => "?").join(", ");
  const avatarRows = await getDb()
    .prepare(
      `SELECT a.leadership_id, a.media_id, a.position, m.r2_key, m.alt_text
         FROM leadership_member_avatars a
         JOIN media m ON m.id = a.media_id
        WHERE a.leadership_id IN (${placeholders})
        ORDER BY a.leadership_id, a.position, a.media_id`,
    )
    .bind(...ids)
    .all<LeadershipAvatarRow & { leadership_id: number }>();

  const byLeadership = new Map<number, LeadershipAvatarRow[]>();
  for (const avatar of avatarRows.results ?? []) {
    const bucket = byLeadership.get(avatar.leadership_id) ?? [];
    bucket.push({
      media_id: avatar.media_id,
      position: avatar.position,
      r2_key: avatar.r2_key,
      alt_text: avatar.alt_text,
    });
    byLeadership.set(avatar.leadership_id, bucket);
  }
  return rows.map((row) => ({ ...row, avatars: byLeadership.get(row.id) ?? [] }));
}

export async function listLeadership(): Promise<LeadershipRow[]> {
  const rows = await getDb()
    .prepare(`SELECT ${COLUMNS} FROM leadership_members ORDER BY position, id`)
    .all<Omit<LeadershipRow, "avatars">>();
  return hydrateAvatars(rows.results ?? []);
}

export async function listLiveLeadership(): Promise<LeadershipRow[]> {
  const rows = await getDb()
    .prepare(
      `SELECT ${COLUMNS} FROM leadership_members
        WHERE status = 'live' ORDER BY position, id`,
    )
    .all<Omit<LeadershipRow, "avatars">>();
  return hydrateAvatars(rows.results ?? []);
}

async function validateAvatarMedia(mediaIds: number[]): Promise<number[]> {
  const ids = [...new Set(mediaIds)];
  if (ids.length === 0) throw new Error("Leadership cần ít nhất 1 avatar.");
  const db = getDb();
  const placeholders = ids.map(() => "?").join(", ");
  const media = await db
    .prepare(
      `SELECT id FROM media
        WHERE id IN (${placeholders}) AND status = 'ready' AND mime LIKE 'image/%'`,
    )
    .bind(...ids)
    .all<{ id: number }>();
  if ((media.results ?? []).length !== ids.length) {
    throw new Error("Avatar phải là ảnh đã tải lên thành công trong thư viện media.");
  }
  return ids;
}

async function insertAvatars(leadershipId: number, ids: number[]): Promise<void> {
  const db = getDb();
  for (let position = 0; position < ids.length; position++) {
    await db
      .prepare(
        `INSERT INTO leadership_member_avatars (leadership_id, media_id, position)
         VALUES (?, ?, ?)`,
      )
      .bind(leadershipId, ids[position], position)
      .run();
  }
}

async function replaceAvatars(leadershipId: number, mediaIds: number[]): Promise<void> {
  const ids = await validateAvatarMedia(mediaIds);
  const db = getDb();
  await db
    .prepare(`DELETE FROM leadership_member_avatars WHERE leadership_id = ?`)
    .bind(leadershipId)
    .run();
  await insertAvatars(leadershipId, ids);
}

export interface LeadershipInput {
  position: number;
  name: string;
  role?: string | null;
  quote?: string | null;
  status?: LeadershipStatus;
  avatar_media_ids: number[];
}

export async function createLeadership(
  actorId: number,
  input: LeadershipInput,
): Promise<LeadershipRow> {
  const avatarIds = await validateAvatarMedia(input.avatar_media_ids);
  const inserted = await getDb()
    .prepare(
      `INSERT INTO leadership_members
       (position, name, role, quote, status, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, unixepoch(), ?)
       RETURNING ${COLUMNS}`,
    )
    .bind(
      input.position,
      input.name,
      input.role ?? null,
      input.quote ?? null,
      input.status ?? "draft",
      actorId,
    )
    .first<Omit<LeadershipRow, "avatars">>();
  if (!inserted) throw new Error("Không tạo được thành viên Leadership.");
  await insertAvatars(inserted.id, avatarIds);
  const after = (await listLeadership()).find((row) => row.id === inserted.id)!;
  await auditLog(actorId, "create", "leadership_members", inserted.id, null, after);
  return after;
}

export async function updateLeadership(
  actorId: number,
  input: Partial<LeadershipInput> & { id: number },
): Promise<LeadershipRow> {
  const before = (await listLeadership()).find((row) => row.id === input.id);
  if (!before)
    throw Object.assign(new Error("Không tìm thấy thành viên Leadership."), { statusCode: 404 });

  const fields: string[] = [];
  const values: unknown[] = [];
  for (const key of ["position", "name", "role", "quote", "status"] as const) {
    const value = input[key];
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    values.push(value);
  }
  if (fields.length > 0) {
    fields.push("updated_at = unixepoch()", "updated_by = ?");
    values.push(actorId, input.id);
    await getDb()
      .prepare(`UPDATE leadership_members SET ${fields.join(", ")} WHERE id = ?`)
      .bind(...values)
      .run();
  }
  if (input.avatar_media_ids !== undefined) {
    await replaceAvatars(input.id, input.avatar_media_ids);
  }
  const after = (await listLeadership()).find((row) => row.id === input.id)!;
  await auditLog(actorId, "update", "leadership_members", input.id, before, after);
  return after;
}

export async function deleteLeadership(actorId: number, id: number): Promise<void> {
  const before = (await listLeadership()).find((row) => row.id === id);
  if (!before) return;
  await getDb().prepare(`DELETE FROM leadership_members WHERE id = ?`).bind(id).run();
  await auditLog(actorId, "delete", "leadership_members", id, before, null);
}

export async function reorderLeadership(actorId: number, orderedIds: number[]): Promise<void> {
  const before = (await listLeadership()).map(({ id, position }) => ({ id, position }));
  for (let position = 0; position < orderedIds.length; position++) {
    await getDb()
      .prepare(
        `UPDATE leadership_members SET position = ?, updated_at = unixepoch(), updated_by = ?
          WHERE id = ?`,
      )
      .bind(position + 1, actorId, orderedIds[position])
      .run();
  }
  await auditLog(actorId, "reorder", "leadership_members", "all", before, orderedIds);
}
