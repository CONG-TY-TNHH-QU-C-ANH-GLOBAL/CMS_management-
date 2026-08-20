// Partners service — business-relationship logos shown on the landing homepage.
//
// Distinct from `integrations` (marketplace/platform sync strip): see the note
// on migration 0043. Not localized — rows are company names and URLs.

import { getDb } from "@/core/db/client";
import { auditLog } from "@/core/db/mutations";

export type PartnerStatus = "draft" | "live";

export interface PartnerRow {
  id: number;
  position: number;
  name: string;
  logo_media_id: number | null;
  url: string | null;
  tier: string | null;
  status: PartnerStatus;
  updated_at: number;
}

const COLUMNS = `id, position, name, logo_media_id, url, tier, status, updated_at`;

/** Admin read — every partner regardless of status. */
export async function listPartners(): Promise<PartnerRow[]> {
  const result = await getDb()
    .prepare(`SELECT ${COLUMNS} FROM partners ORDER BY position, id`)
    .all<PartnerRow>();
  return result.results ?? [];
}

/** Public read — live rows only. */
export async function listLivePartners(): Promise<PartnerRow[]> {
  const result = await getDb()
    .prepare(`SELECT ${COLUMNS} FROM partners WHERE status = 'live' ORDER BY position, id`)
    .all<PartnerRow>();
  return result.results ?? [];
}

export interface CreatePartnerInput {
  position: number;
  name: string;
  logo_media_id?: number | null;
  url?: string | null;
  tier?: string | null;
  status?: PartnerStatus;
}

export async function createPartner(
  actorId: number,
  input: CreatePartnerInput,
): Promise<PartnerRow> {
  const db = getDb();
  const inserted = await db
    .prepare(
      `INSERT INTO partners (position, name, logo_media_id, url, tier, status, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, unixepoch(), ?)
       RETURNING ${COLUMNS}`,
    )
    .bind(
      input.position,
      input.name,
      input.logo_media_id ?? null,
      input.url ?? null,
      input.tier ?? null,
      input.status ?? "draft",
      actorId,
    )
    .first<PartnerRow>();
  if (!inserted) throw new Error("Không tạo được đối tác.");
  await auditLog(actorId, "create", "partners", inserted.id, null, inserted);
  return inserted;
}

export interface UpdatePartnerInput {
  id: number;
  position?: number;
  name?: string;
  logo_media_id?: number | null;
  url?: string | null;
  tier?: string | null;
  status?: PartnerStatus;
}

export async function updatePartner(
  actorId: number,
  input: UpdatePartnerInput,
): Promise<PartnerRow> {
  const db = getDb();
  const before = await db
    .prepare(`SELECT ${COLUMNS} FROM partners WHERE id = ? LIMIT 1`)
    .bind(input.id)
    .first<PartnerRow>();
  if (!before) throw Object.assign(new Error("Không tìm thấy đối tác."), { statusCode: 404 });

  const fields: string[] = [];
  const values: unknown[] = [];
  for (const key of ["position", "name", "logo_media_id", "url", "tier", "status"] as const) {
    const value = input[key];
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    values.push(value);
  }
  if (fields.length === 0) return before;

  fields.push("updated_at = unixepoch()", "updated_by = ?");
  values.push(actorId, input.id);
  await db
    .prepare(`UPDATE partners SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();

  const after = await db
    .prepare(`SELECT ${COLUMNS} FROM partners WHERE id = ?`)
    .bind(input.id)
    .first<PartnerRow>();
  await auditLog(actorId, "update", "partners", input.id, before, after);
  return after!;
}

export async function deletePartner(actorId: number, id: number): Promise<void> {
  const db = getDb();
  const before = await db
    .prepare(`SELECT ${COLUMNS} FROM partners WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<PartnerRow>();
  if (!before) return;
  await db.prepare(`DELETE FROM partners WHERE id = ?`).bind(id).run();
  await auditLog(actorId, "delete", "partners", id, before, null);
}

export async function reorderPartners(actorId: number, orderedIds: number[]): Promise<void> {
  const db = getDb();
  const before =
    (
      await db
        .prepare(`SELECT id, position FROM partners ORDER BY position`)
        .all<{ id: number; position: number }>()
    ).results ?? [];
  for (let i = 0; i < orderedIds.length; i++) {
    await db
      .prepare(
        `UPDATE partners SET position = ?, updated_at = unixepoch(), updated_by = ? WHERE id = ?`,
      )
      .bind(i + 1, actorId, orderedIds[i])
      .run();
  }
  await auditLog(actorId, "reorder", "partners", "all", before, orderedIds);
}
