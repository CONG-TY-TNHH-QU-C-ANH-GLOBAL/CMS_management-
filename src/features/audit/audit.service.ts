// Audit log read service. All write/insert operations go through
// core/db/mutations.ts `auditLog()` which is called by every feature service
// mutation. This module only reads + paginates for the admin viewer.

import { getDb } from "@/core/db/client";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "reorder"
  | "publish"
  | "rollback";

export interface AuditLogRow {
  id: number;
  actor_id: number | null;
  actor_name: string | null;
  actor_email: string | null;
  action: AuditAction;
  entity: string;
  entity_id: string | null;
  before_json: string | null;
  after_json: string | null;
  at: number;
}

export interface ListAuditInput {
  actor_id?: number | null;
  action?: AuditAction | null;
  entity?: string | null;
  entity_id?: string | null;
  since?: number | null;   // unix seconds
  until?: number | null;
  limit?: number;
  offset?: number;
}

export interface AuditFacets {
  actions: string[];
  entities: string[];
  actors: { id: number; name: string | null; email: string }[];
}

export async function listAuditLog(input: ListAuditInput = {}): Promise<{
  rows: AuditLogRow[];
  total: number;
}> {
  const limit = Math.max(1, Math.min(200, input.limit ?? 50));
  const offset = Math.max(0, input.offset ?? 0);

  const where: string[] = [];
  const params: unknown[] = [];
  if (input.actor_id != null) {
    where.push("a.actor_id = ?");
    params.push(input.actor_id);
  }
  if (input.action) {
    where.push("a.action = ?");
    params.push(input.action);
  }
  if (input.entity) {
    where.push("a.entity = ?");
    params.push(input.entity);
  }
  if (input.entity_id) {
    where.push("a.entity_id = ?");
    params.push(input.entity_id);
  }
  if (input.since != null) {
    where.push("a.at >= ?");
    params.push(input.since);
  }
  if (input.until != null) {
    where.push("a.at <= ?");
    params.push(input.until);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const totalRes = await getDb()
    .prepare(`SELECT COUNT(*) AS c FROM audit_log a ${whereSql}`)
    .bind(...params)
    .first<{ c: number }>();
  const total = totalRes?.c ?? 0;

  const rowsRes = await getDb()
    .prepare(
      `SELECT a.id, a.actor_id, u.name AS actor_name, u.email AS actor_email,
              a.action, a.entity, a.entity_id, a.before_json, a.after_json, a.at
         FROM audit_log a
         LEFT JOIN users u ON u.id = a.actor_id
         ${whereSql}
         ORDER BY a.at DESC, a.id DESC
         LIMIT ? OFFSET ?`,
    )
    .bind(...params, limit, offset)
    .all<AuditLogRow>();

  return { rows: rowsRes.results ?? [], total };
}

export async function listAuditFacets(): Promise<AuditFacets> {
  const [actionsRes, entitiesRes, actorsRes] = await Promise.all([
    getDb()
      .prepare(`SELECT DISTINCT action FROM audit_log ORDER BY action`)
      .all<{ action: string }>(),
    getDb()
      .prepare(`SELECT DISTINCT entity FROM audit_log ORDER BY entity`)
      .all<{ entity: string }>(),
    getDb()
      .prepare(
        `SELECT DISTINCT u.id, u.name, u.email
           FROM audit_log a JOIN users u ON u.id = a.actor_id
           ORDER BY u.email`,
      )
      .all<{ id: number; name: string | null; email: string }>(),
  ]);
  return {
    actions: (actionsRes.results ?? []).map((r) => r.action),
    entities: (entitiesRes.results ?? []).map((r) => r.entity),
    actors: actorsRes.results ?? [],
  };
}
