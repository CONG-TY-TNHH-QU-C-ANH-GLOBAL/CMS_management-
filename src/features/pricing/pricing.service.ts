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
  data_json: string;        // JSON.stringify of the new data
  schema_json?: string;     // optional schema update (column defs)
  comment?: string | null;  // change comment for version log
  actorId: number;          // user.id from session
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
    .prepare(
      `SELECT id, version, data_json, schema_json FROM pricing_tables WHERE slug = ?`,
    )
    .bind(input.slug)
    .first<{ id: number; version: number; data_json: string; schema_json: string }>();
  if (!current) {
    throw Object.assign(new Error(`Pricing table "${input.slug}" not found`), { statusCode: 404 });
  }

  // Snapshot current → versions table (preserves what was JUST replaced)
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

  const newVersion = current.version + 1;
  const newSchemaJson = input.schema_json ?? current.schema_json;

  await db
    .prepare(
      `UPDATE pricing_tables
          SET data_json = ?, schema_json = ?, version = ?, updated_at = unixepoch(), updated_by = ?
        WHERE id = ?`,
    )
    .bind(input.data_json, newSchemaJson, newVersion, input.actorId, current.id)
    .run();

  return { ok: true, newVersion };
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
