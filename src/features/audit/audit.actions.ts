import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type { AuditLogRow, AuditAction, AuditFacets } from "@/features/audit";

const ACTION = z.enum(["create", "update", "delete", "reorder", "publish", "rollback"]);

export const listAuditLogFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z
      .object({
        actor_id: z.number().int().positive().nullable().optional(),
        action: ACTION.nullable().optional(),
        entity: z.string().max(100).nullable().optional(),
        entity_id: z.string().max(200).nullable().optional(),
        since: z.number().int().min(0).nullable().optional(),
        until: z.number().int().min(0).nullable().optional(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { listAuditLog, listAuditFacets } = await import("@/features/audit");
    // Auditor-level: admin only. Regular editors don't see who-changed-what.
    await requireSession("admin");
    const [list, facets] = await Promise.all([listAuditLog(data), listAuditFacets()]);
    return { ...list, facets };
  });
