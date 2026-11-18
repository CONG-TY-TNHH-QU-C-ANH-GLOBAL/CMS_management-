import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";

import {
  createLoader,
  d1,
  migratedSnapshot,
  srcPath,
} from "@/features/campaigns/landing/__fixtures__/worker-harness.test";
import type { UspsGaRow } from "./uspsGa.constants";

const ACTOR = 7;
let sql: Database;
let snapshot: Uint8Array;

/** Runs right before the service's batch, to interleave a concurrent write. */
let beforeBatch: (() => void) | null = null;
const baseDb = d1(() => sql);
const db = new Proxy(baseDb, {
  get(target, prop, receiver) {
    if (prop === "batch") {
      return (stmts: Parameters<typeof baseDb.batch>[0]) => {
        beforeBatch?.();
        return target.batch(stmts);
      };
    }
    return Reflect.get(target, prop, receiver) as unknown;
  },
});
const loader = createLoader({ "@/core/db/client": { getDb: () => db } });
const service = loader.load<typeof import("./uspsGa.service")>(
  srcPath("features/pricing/uspsGa.service"),
);

beforeAll(() => {
  snapshot = migratedSnapshot();
});
beforeEach(() => {
  sql = Database.deserialize(snapshot);
  beforeBatch = null;
});

function seededTiers(): UspsGaRow[][] {
  return [1, 2, 3, 4, 5].map((n) => {
    const row = sql
      .query(`SELECT data_json FROM pricing_tables WHERE slug = ?`)
      .get(`uspsGaLabelT${n}`) as { data_json: string };
    return JSON.parse(row.data_json) as UspsGaRow[];
  });
}

/** Every tier's price plus one cent, so a successful save is visible in every row. */
function raised(): UspsGaRow[][] {
  return seededTiers().map((rows) => rows.map((r) => ({ ...r, z1: +(r.z1 + 0.01).toFixed(2) })));
}

function state() {
  const versions = sql
    .query(`SELECT slug, version FROM pricing_tables WHERE slug LIKE 'uspsGaLabelT%' ORDER BY slug`)
    .all() as { slug: string; version: number }[];
  const snapshots = sql
    .query(
      `SELECT COUNT(*) AS n FROM pricing_table_versions v JOIN pricing_tables t ON t.id = v.table_id
        WHERE t.slug LIKE 'uspsGaLabelT%'`,
    )
    .get() as { n: number };
  return { versions: versions.map((v) => v.version), snapshots: snapshots.n };
}

describe("saveUspsGaTiers", () => {
  test("publishes all five tiers with a version bump and a snapshot each", async () => {
    const tiers = raised();
    const result = await service.saveUspsGaTiers({
      tiers,
      expectedVersions: [1, 1, 1, 1, 1],
      actorId: ACTOR,
    });
    expect(result.newVersions).toEqual([2, 2, 2, 2, 2]);
    expect(state()).toEqual({ versions: [2, 2, 2, 2, 2], snapshots: 5 });
    expect(seededTiers()).toEqual(tiers);
  });

  test("a stale version on one tier writes nothing for any tier", async () => {
    const before = seededTiers();
    await expect(
      service.saveUspsGaTiers({
        tiers: raised(),
        expectedVersions: [1, 1, 0, 1, 1],
        actorId: ACTOR,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(state()).toEqual({ versions: [1, 1, 1, 1, 1], snapshots: 0 });
    expect(seededTiers()).toEqual(before);
  });

  test("a concurrent publish of one tier rolls back the whole batch", async () => {
    // Simulate another editor having published Tier 4 between our read and write:
    // its snapshot at version 1 already exists.
    sql
      .query(
        `INSERT INTO pricing_table_versions(table_id, version, snapshot_json, updated_by, created_at)
         SELECT id, 1, '{}', 1, unixepoch() FROM pricing_tables WHERE slug = 'uspsGaLabelT4'`,
      )
      .run();
    const before = seededTiers();
    await expect(
      service.saveUspsGaTiers({
        tiers: raised(),
        expectedVersions: [1, 1, 1, 1, 1],
        actorId: ACTOR,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(state()).toEqual({ versions: [1, 1, 1, 1, 1], snapshots: 1 });
    expect(seededTiers()).toEqual(before);
  });

  test("a single-table save that updated Tier 4 before writing its snapshot still rolls back all tiers", async () => {
    // savePricingTable runs UPDATE first and the snapshot INSERT after, so no
    // snapshot at v1 exists yet when our batch runs: only the guard catches it.
    const before = seededTiers();
    beforeBatch = () => {
      sql.query(`UPDATE pricing_tables SET version = 2 WHERE slug = 'uspsGaLabelT4'`).run();
    };
    await expect(
      service.saveUspsGaTiers({
        tiers: raised(),
        expectedVersions: [1, 1, 1, 1, 1],
        actorId: ACTOR,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(state()).toEqual({ versions: [1, 1, 1, 2, 1], snapshots: 0 });
    expect(seededTiers().filter((_, i) => i !== 3)).toEqual(before.filter((_, i) => i !== 3));
  });

  test("rejects a wrong weight or a negative price before touching the database", async () => {
    const wrongWeight = raised();
    wrongWeight[2][5] = { ...wrongWeight[2][5], oz: 33 };
    await expect(
      service.saveUspsGaTiers({
        tiers: wrongWeight,
        expectedVersions: [1, 1, 1, 1, 1],
        actorId: ACTOR,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    const negative = raised();
    negative[0][0] = { ...negative[0][0], z9: -1 };
    await expect(
      service.saveUspsGaTiers({
        tiers: negative,
        expectedVersions: [1, 1, 1, 1, 1],
        actorId: ACTOR,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(state()).toEqual({ versions: [1, 1, 1, 1, 1], snapshots: 0 });
  });
});
