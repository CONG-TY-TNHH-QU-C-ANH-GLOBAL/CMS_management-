// Catalog product overrides — per-product settings for the Hub-owned catalog.
//
// The landing reads products from the Hub; this table adds what the Hub does
// not publish: a design-template link and the "price already includes shipping"
// flag. See migrations 0068 and 0070. Not localized — a URL and a yes/no.
//
// The shipping flag has a catalog-wide default (catalog_settings); a product's
// own flag is NULL to follow it, or 0/1 as an explicit exception.

import { getDb } from "@/core/db/client";
import { auditLog } from "@/core/db/mutations";

export interface CatalogOverrideRow {
  id: number;
  product_id: string;
  label: string | null;
  template_url: string | null;
  /** NULL = follow the catalog-wide default. */
  price_includes_shipping: 0 | 1 | null;
  updated_at: number;
}

export interface CatalogSettings {
  price_includes_shipping_default: boolean;
}

/** Catalog-wide settings. Falls back to "includes shipping" if the row is missing. */
export async function getCatalogSettings(): Promise<CatalogSettings> {
  const row = await getDb()
    .prepare(`SELECT price_includes_shipping_default FROM catalog_settings WHERE id = 1`)
    .first<{ price_includes_shipping_default: 0 | 1 }>();
  return {
    price_includes_shipping_default: row ? row.price_includes_shipping_default === 1 : true,
  };
}

export async function updateCatalogSettings(
  actorId: number,
  input: CatalogSettings,
): Promise<CatalogSettings> {
  const db = getDb();
  const before = await getCatalogSettings();
  await db
    .prepare(
      `INSERT INTO catalog_settings (id, price_includes_shipping_default, updated_at, updated_by)
       VALUES (1, ?, unixepoch(), ?)
       ON CONFLICT (id) DO UPDATE SET
         price_includes_shipping_default = excluded.price_includes_shipping_default,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
    )
    .bind(input.price_includes_shipping_default ? 1 : 0, actorId)
    .run();
  await auditLog(actorId, "update", "catalog_settings", 1, before, input);
  return input;
}

const COLUMNS = `id, product_id, label, template_url, price_includes_shipping, updated_at`;

export async function listCatalogOverrides(): Promise<CatalogOverrideRow[]> {
  const result = await getDb()
    .prepare(`SELECT ${COLUMNS} FROM catalog_product_overrides ORDER BY label, product_id`)
    .all<CatalogOverrideRow>();
  return result.results ?? [];
}

export interface CatalogOverrideInput {
  product_id: string;
  label?: string | null;
  template_url?: string | null;
  /** null = follow the catalog-wide default. */
  price_includes_shipping: boolean | null;
}

/** Create or replace the settings for one product (one row per Hub product). */
export async function upsertCatalogOverride(
  actorId: number,
  input: CatalogOverrideInput,
): Promise<CatalogOverrideRow> {
  const db = getDb();
  const before = await db
    .prepare(`SELECT ${COLUMNS} FROM catalog_product_overrides WHERE product_id = ? LIMIT 1`)
    .bind(input.product_id)
    .first<CatalogOverrideRow>();

  const saved = await db
    .prepare(
      `INSERT INTO catalog_product_overrides
         (product_id, label, template_url, price_includes_shipping, updated_at, updated_by)
       VALUES (?, ?, ?, ?, unixepoch(), ?)
       ON CONFLICT (product_id) DO UPDATE SET
         label = excluded.label,
         template_url = excluded.template_url,
         price_includes_shipping = excluded.price_includes_shipping,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by
       RETURNING ${COLUMNS}`,
    )
    .bind(
      input.product_id,
      input.label ?? null,
      input.template_url ?? null,
      input.price_includes_shipping === null ? null : input.price_includes_shipping ? 1 : 0,
      actorId,
    )
    .first<CatalogOverrideRow>();
  if (!saved) throw new Error("Không lưu được cài đặt sản phẩm.");
  await auditLog(
    actorId,
    before ? "update" : "create",
    "catalog_product_overrides",
    saved.id,
    before ?? null,
    saved,
  );
  return saved;
}

export async function deleteCatalogOverride(actorId: number, id: number): Promise<void> {
  const db = getDb();
  const before = await db
    .prepare(`SELECT ${COLUMNS} FROM catalog_product_overrides WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<CatalogOverrideRow>();
  if (!before) return;
  await db.prepare(`DELETE FROM catalog_product_overrides WHERE id = ?`).bind(id).run();
  await auditLog(actorId, "delete", "catalog_product_overrides", id, before, null);
}
