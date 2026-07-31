// Filesystem discovery for the migration runner. Split from runner.ts so the runner stays
// pure (exec port + already-loaded Migration[]) and can be exercised against PGlite without
// touching disk.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { orderMigrationFiles, toMigration, type Migration } from "./runner";

/** db/pg/migrations — ORDERED schema history. Recorded in schema_migrations. */
export const MIGRATIONS_DIR = fileURLToPath(
  new URL("../../../../db/pg/migrations/", import.meta.url),
);

/** db/pg/bootstrap — cluster-level roles and privileges. NOT migration history. */
export const BOOTSTRAP_DIR = fileURLToPath(
  new URL("../../../../db/pg/bootstrap/", import.meta.url),
);

/** Read and order the schema migrations. Reads `migrations/` ONLY — bootstrap/ is applied by a
 *  separate, unrecorded call because roles are cluster objects and bootstrap is re-runnable by
 *  design (recording a checksum over it would claim an immutability it does not have). */
export function discoverMigrations(dir: string = MIGRATIONS_DIR): Migration[] {
  return orderMigrationFiles(readdirSync(dir)).map((name) =>
    toMigration(name, readFileSync(join(dir, name), "utf8")),
  );
}

export function discoverBootstrap(dir: string = BOOTSTRAP_DIR): { name: string; sql: string }[] {
  return orderMigrationFiles(readdirSync(dir)).map((name) => ({
    name,
    sql: readFileSync(join(dir, name), "utf8"),
  }));
}
