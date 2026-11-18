// Publish all five USPS Ground Advantage label tiers in one all-or-nothing write.

import { getDb } from "@/core/db/client";
import { USPS_GA_SLUGS, USPS_GA_WEIGHTS, type UspsGaRow } from "./uspsGa.constants";
import { PricingVersionConflictError } from "./pricing.service";

export interface SaveUspsGaTiersInput {
  /** Exactly five tiers, Tier 1 first, each with the 24 standard weights. */
  tiers: UspsGaRow[][];
  /** Version of each tier the admin previewed against, Tier 1 first. */
  expectedVersions: number[];
  comment?: string | null;
  actorId: number;
}

export interface SaveUspsGaTiersResult {
  ok: true;
  newVersions: number[];
}

const ZONES = ["z1", "z2", "z3", "z4", "z5", "z6", "z7", "z8", "z9"] as const;

function badRequest(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400 });
}

/** Server-side re-check: never trust the browser parser alone. */
export function assertValidUspsGaTiers(tiers: UspsGaRow[][]): void {
  if (tiers.length !== USPS_GA_SLUGS.length) throw badRequest("Cần đúng 5 tier");
  tiers.forEach((rows, t) => {
    if (rows.length !== USPS_GA_WEIGHTS.length) {
      throw badRequest(`Tier ${t + 1}: cần đúng ${USPS_GA_WEIGHTS.length} dòng`);
    }
    rows.forEach((row, r) => {
      if (row.oz !== USPS_GA_WEIGHTS[r]) {
        throw badRequest(`Tier ${t + 1}, dòng ${r + 1}: cân nặng phải là ${USPS_GA_WEIGHTS[r]} oz`);
      }
      for (const key of ["g", ...ZONES] as const) {
        const v = row[key];
        if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
          throw badRequest(`Tier ${t + 1}, dòng ${r + 1}: ô ${key} không hợp lệ`);
        }
      }
    });
  });
}

/**
 * Writes the five tiers as one D1 batch (a transaction): a snapshot of each
 * current row, then the conditional UPDATE, then a guard. If any tier moved
 * since the preview, either the snapshot insert hits UNIQUE(table_id, version)
 * or the guard sees fewer than five rows at the new version, and nothing is
 * written for any tier.
 */
export async function saveUspsGaTiers(input: SaveUspsGaTiersInput): Promise<SaveUspsGaTiersResult> {
  assertValidUspsGaTiers(input.tiers);
  if (input.expectedVersions.length !== USPS_GA_SLUGS.length) {
    throw badRequest("Thiếu phiên bản của từng tier");
  }
  const db = getDb();
  const placeholders = USPS_GA_SLUGS.map(() => "?").join(",");
  const { results } = await db
    .prepare(
      `SELECT id, slug, version, data_json, schema_json FROM pricing_tables WHERE slug IN (${placeholders})`,
    )
    .bind(...USPS_GA_SLUGS)
    .all<{ id: number; slug: string; version: number; data_json: string; schema_json: string }>();
  const current = USPS_GA_SLUGS.map((slug) => {
    const row = results.find((r) => r.slug === slug);
    if (!row)
      throw Object.assign(new Error(`Pricing table "${slug}" not found`), { statusCode: 404 });
    return row;
  });

  current.forEach((row, i) => {
    if (row.version !== input.expectedVersions[i]) {
      throw new PricingVersionConflictError(input.expectedVersions[i], row.version);
    }
  });

  const snapshots = current.map((row) =>
    db
      .prepare(
        `INSERT INTO pricing_table_versions(table_id, version, snapshot_json, comment, updated_by, created_at)
         VALUES(?, ?, ?, ?, ?, unixepoch())`,
      )
      .bind(
        row.id,
        row.version,
        JSON.stringify({ data: JSON.parse(row.data_json), schema: JSON.parse(row.schema_json) }),
        input.comment ?? null,
        input.actorId,
      ),
  );
  const updates = current.map((row, i) =>
    db
      .prepare(
        `UPDATE pricing_tables
            SET data_json = ?, version = ?, updated_at = unixepoch(), updated_by = ?
          WHERE id = ? AND version = ?`,
      )
      .bind(JSON.stringify(input.tiers[i]), row.version + 1, input.actorId, row.id, row.version),
  );

  // A single-table save runs UPDATE first and inserts its snapshot afterwards,
  // so a tier can move between our read and our batch without any snapshot
  // existing yet: its UPDATE then matches 0 rows, which does not fail a batch.
  // This last statement does: unless every tier now carries our new version
  // and exactly our data, json() raises "malformed JSON" and D1 rolls
  // everything back.
  const guardPairs = current.map(() => "(id = ? AND version = ? AND data_json = ?)").join(" OR ");
  const guard = db
    .prepare(
      `SELECT json(CASE WHEN (SELECT COUNT(*) FROM pricing_tables WHERE ${guardPairs}) = ?
                        THEN '{}' ELSE 'uspsGa version conflict' END) AS ok`,
    )
    .bind(
      ...current.flatMap((row, i) => [row.id, row.version + 1, JSON.stringify(input.tiers[i])]),
      current.length,
    );

  try {
    await db.batch([...snapshots, ...updates, guard]);
  } catch (err) {
    if (/UNIQUE|malformed JSON/i.test(String(err))) {
      throw new PricingVersionConflictError(input.expectedVersions[0], -1);
    }
    throw err;
  }
  return { ok: true, newVersions: current.map((row) => row.version + 1) };
}
