// Helpers for write operations: audit log + KV cache invalidation.
// Every service mutation should call both: auditLog() + bumpCmsRev().

import { getDb } from "@/core/db/client";

export async function auditLog(
  actorId: number,
  action: "create" | "update" | "delete" | "reorder" | "publish" | "rollback",
  entity: string,
  entityId: string | number | null,
  before: unknown,
  after: unknown,
): Promise<void> {
  await getDb()
    .prepare(
      `INSERT INTO audit_log (actor_id, action, entity, entity_id, before_json, after_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      actorId,
      action,
      entity,
      entityId === null ? null : String(entityId),
      before === null || before === undefined ? null : JSON.stringify(before),
      after === null || after === undefined ? null : JSON.stringify(after),
    )
    .run();
}

// Bumps the CMS revision key in KV so public REST API edge cache invalidates on next request.
// Public route handlers use this rev as part of the cache key (or as a Last-Modified hint).
export async function bumpCmsRev(): Promise<void> {
  const { env } = await import("cloudflare:workers");
  await env.CMS_REV.put("rev", String(Date.now()));
}
