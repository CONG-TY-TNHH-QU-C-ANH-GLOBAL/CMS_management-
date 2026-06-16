// Pricing service — read functions for pricing tables.

import { getDb } from "@/core/db/client";

export type PricingKind = "weight_grid" | "meta_kv";
export type PricingStatus = "draft" | "live" | "archived";

export interface PricingTableRow {
  id: number;
  slug: string;
  name: string;
  kind: PricingKind;
  description: string | null;
  schema_json: string;
  data_json: string;
  version: number;
  status: PricingStatus;
  updated_at: number;
}

export interface PricingTableSummary {
  id: number;
  slug: string;
  name: string;
  kind: PricingKind;
  version: number;
  status: PricingStatus;
  updated_at: number;
  row_count: number; // computed: number of rows/keys in data_json
  col_count: number; // computed: number of columns (weight_grid only)
}

function inferCategory(slug: string): string {
  if (slug.startsWith("expressVnUs")) return "Express VN→US (Hàng Lô)";
  if (slug.startsWith("expressCn")) return "Express CN→US (Hàng Lô)";
  if (slug.startsWith("express")) return "Express";
  if (slug.startsWith("vn")) return "Việt Nam";
  if (slug.startsWith("cn")) return "Trung Quốc";
  if (slug.startsWith("tiktok")) return "TikTok Shop";
  if (slug.startsWith("usps") || slug === "usDomestic") return "USPS / US Domestic";
  if (slug === "euRate") return "EU";
  if (slug === "redelivery") return "Phụ phí";
  return "Khác";
}

export interface PricingCategory {
  name: string;
  tables: PricingTableSummary[];
}

export async function listPricingTables(): Promise<PricingCategory[]> {
  const result = await getDb()
    .prepare(
      `SELECT id, slug, name, kind, data_json, version, status, updated_at
         FROM pricing_tables ORDER BY id`,
    )
    .all<{
      id: number;
      slug: string;
      name: string;
      kind: PricingKind;
      data_json: string;
      version: number;
      status: PricingStatus;
      updated_at: number;
    }>();

  const rows = result.results ?? [];
  const summaries: PricingTableSummary[] = rows.map((r) => {
    let row_count = 0;
    let col_count = 0;
    try {
      const data = JSON.parse(r.data_json);
      if (Array.isArray(data)) {
        row_count = data.length;
        const cols = new Set<string>();
        for (const row of data) {
          if (row && typeof row === "object") {
            for (const k of Object.keys(row)) cols.add(k);
          }
        }
        col_count = cols.size;
      } else if (data && typeof data === "object") {
        row_count = Object.keys(data).length;
        col_count = 0;
      }
    } catch {
      // Ignore parse errors
    }
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      kind: r.kind,
      version: r.version,
      status: r.status,
      updated_at: r.updated_at,
      row_count,
      col_count,
    };
  });

  // Group by inferred category
  const map = new Map<string, PricingTableSummary[]>();
  for (const s of summaries) {
    const cat = inferCategory(s.slug);
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(s);
  }

  return Array.from(map.entries()).map(([name, tables]) => ({ name, tables }));
}

export async function getPricingTable(slug: string): Promise<PricingTableRow | null> {
  const result = await getDb()
    .prepare(
      `SELECT id, slug, name, kind, description, schema_json, data_json, version, status, updated_at
         FROM pricing_tables WHERE slug = ? LIMIT 1`,
    )
    .bind(slug)
    .first<PricingTableRow>();
  return result ?? null;
}

export interface SavePricingTableInput {
  slug: string;
  data_json: string; // JSON.stringify of the new data
  schema_json?: string; // optional schema update (column defs)
  comment?: string | null; // change comment for version log
  actorId: number; // user.id from session
  /**
   * Optimistic-concurrency guard. When provided, the save is rejected (409) if
   * the live row's version no longer equals this value — i.e. someone else
   * published since the editor loaded. Prevents silent last-write-wins
   * overwrites of pricing data.
   */
  expectedVersion?: number;
}

/** Thrown when expectedVersion no longer matches the live row. statusCode 409. */
export class PricingVersionConflictError extends Error {
  statusCode = 409;
  code = "VERSION_CONFLICT";
  constructor(
    public expected: number,
    public actual: number,
  ) {
    super(
      `Phiên bản đã thay đổi trên máy chủ (bạn đang sửa v${expected}, hiện tại là v${actual}). ` +
        `Tải lại trang để xem bản mới nhất rồi áp dụng lại thay đổi.`,
    );
    this.name = "PricingVersionConflictError";
  }
}

export interface SavePricingTableResult {
  ok: true;
  newVersion: number;
}

/**
 * Save pricing table edits — atomic version bump + snapshot.
 * 1. Snapshot CURRENT row to pricing_table_versions (preserves rollback history)
 * 2. Update pricing_tables row with new data + version + 1
 * Caller should bump KV cms:rev after this to invalidate edge cache.
 */
export async function savePricingTable(
  input: SavePricingTableInput,
): Promise<SavePricingTableResult> {
  const db = getDb();

  const current = await db
    .prepare(`SELECT id, version, data_json, schema_json FROM pricing_tables WHERE slug = ?`)
    .bind(input.slug)
    .first<{ id: number; version: number; data_json: string; schema_json: string }>();
  if (!current) {
    throw Object.assign(new Error(`Pricing table "${input.slug}" not found`), { statusCode: 404 });
  }

  // Optimistic concurrency (fast path): reject if the live row already moved.
  if (input.expectedVersion != null && current.version !== input.expectedVersion) {
    throw new PricingVersionConflictError(input.expectedVersion, current.version);
  }

  const newVersion = current.version + 1;
  const newSchemaJson = input.schema_json ?? current.schema_json;

  // Atomic guard: the UPDATE only matches while the row is still at the version
  // we read (WHERE version = ?). Two concurrent publishers can both pass the
  // fast-path check above; the conditional UPDATE serializes them — the loser
  // affects 0 rows and gets a proper conflict error (not a raw UNIQUE crash on
  // the snapshot insert). D1 has no interactive transaction, so we update FIRST
  // (the serialization point) and snapshot only after it succeeds.
  const upd = await db
    .prepare(
      `UPDATE pricing_tables
          SET data_json = ?, schema_json = ?, version = ?, updated_at = unixepoch(), updated_by = ?
        WHERE id = ? AND version = ?`,
    )
    .bind(input.data_json, newSchemaJson, newVersion, input.actorId, current.id, current.version)
    .run();

  if (!upd.meta || upd.meta.changes === 0) {
    const fresh = await db
      .prepare(`SELECT version FROM pricing_tables WHERE id = ?`)
      .bind(current.id)
      .first<{ version: number }>();
    throw new PricingVersionConflictError(
      input.expectedVersion ?? current.version,
      fresh?.version ?? -1,
    );
  }

  // Snapshot the row we just replaced (its old data/version) for rollback.
  await db
    .prepare(
      `INSERT INTO pricing_table_versions(table_id, version, snapshot_json, comment, updated_by, created_at)
       VALUES(?, ?, ?, ?, ?, unixepoch())`,
    )
    .bind(
      current.id,
      current.version,
      JSON.stringify({
        data: JSON.parse(current.data_json),
        schema: JSON.parse(current.schema_json),
      }),
      input.comment ?? null,
      input.actorId,
    )
    .run();

  return { ok: true, newVersion };
}

/**
 * Roll back a pricing table to a prior version's snapshot.
 * Implemented as a *forward* rollback: it re-publishes the snapshot's data as a
 * NEW version via savePricingTable, so history is never rewritten and the
 * rollback itself is reversible. Returns the new version number.
 */
export async function rollbackPricingTable(input: {
  slug: string;
  toVersion: number;
  actorId: number;
}): Promise<SavePricingTableResult> {
  const db = getDb();
  const snap = await db
    .prepare(
      `SELECT v.snapshot_json
         FROM pricing_table_versions v
         JOIN pricing_tables t ON t.id = v.table_id
        WHERE t.slug = ? AND v.version = ?
        LIMIT 1`,
    )
    .bind(input.slug, input.toVersion)
    .first<{ snapshot_json: string }>();
  if (!snap) {
    throw Object.assign(new Error(`Version ${input.toVersion} of "${input.slug}" not found`), {
      statusCode: 404,
    });
  }

  let parsed: { data: unknown; schema: unknown };
  try {
    parsed = JSON.parse(snap.snapshot_json);
  } catch {
    throw Object.assign(new Error("Snapshot bị hỏng — không thể rollback"), { statusCode: 422 });
  }

  // Guard against a snapshot missing either key: JSON.stringify(undefined)
  // returns undefined (not a string), which would bind as NULL and poison the
  // row for all future saves. Fall back to the snapshot's other half / current.
  const dataJson = JSON.stringify(parsed.data);
  const schemaJson = JSON.stringify(parsed.schema);
  if (dataJson === undefined) {
    throw Object.assign(new Error("Snapshot thiếu dữ liệu (data) — không thể rollback"), {
      statusCode: 422,
    });
  }

  return savePricingTable({
    slug: input.slug,
    data_json: dataJson,
    // schema_json is optional in savePricingTable (falls back to current when
    // undefined), so an absent snapshot schema is safe.
    schema_json: schemaJson,
    comment: `Rollback về version ${input.toVersion}`,
    actorId: input.actorId,
  });
}

export interface PricingVersionRow {
  id: number;
  table_id: number;
  version: number;
  snapshot_json: string;
  comment: string | null;
  updated_by: number | null;
  created_at: number;
}

export async function listPricingVersions(slug: string, limit = 20): Promise<PricingVersionRow[]> {
  const result = await getDb()
    .prepare(
      `SELECT v.id, v.table_id, v.version, v.snapshot_json, v.comment, v.updated_by, v.created_at
         FROM pricing_table_versions v
         JOIN pricing_tables t ON t.id = v.table_id
        WHERE t.slug = ?
        ORDER BY v.version DESC
        LIMIT ?`,
    )
    .bind(slug, limit)
    .all<PricingVersionRow>();
  return result.results ?? [];
}
