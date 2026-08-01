// Migration-runner behavior against REAL PostgreSQL in-process (PGlite).
//
// WHAT THIS PROVES: clean apply, no-op rerun, checksum rejection, deleted-migration rejection,
// failure handling, one history row per migration, advisory-lock acquire/release including
// release-after-failure, and the transactional/non-transactional split.
//
// WHAT THIS DOES NOT PROVE: real multi-session concurrency. PGlite is a single in-process
// connection, so two runners cannot genuinely race here — pg_advisory_lock is re-entrant
// within one session and would grant twice. The two-runner serialization test is the required
// preview gate (scripts/pg-migrate-concurrency.ts) and MUST run against a real PostgreSQL
// server. Do not read a green run of this file as a concurrency proof.

import { test, expect } from "bun:test";
import { PGlite } from "@electric-sql/pglite";

import { pgliteMigrationExec } from "./exec";
import type { MigrationExec } from "./runner";
import {
  InvalidMigrationDirectiveError,
  byMigrationFilename,
  parseTransactionMode,
  buildPlan,
  checksumOf,
  ensureMigrationTable,
  MigrationChecksumError,
  MigrationFailedError,
  MIGRATION_LOCK_KEYS,
  MissingMigrationError,
  migrationStatus,
  orderMigrationFiles,
  readApplied,
  runMigrations,
  toMigration,
  withMigrationLock,
  type Migration,
} from "./runner";
import { discoverMigrations } from "./discover";

async function withDb(body: (exec: MigrationExec, db: PGlite) => Promise<void>): Promise<void> {
  const db = new PGlite();
  try {
    await body(pgliteMigrationExec(db), db);
  } finally {
    await db.close();
  }
}

const mig = (name: string, sql: string): Migration => toMigration(name, sql);

const SIMPLE: Migration[] = [
  mig("0001_a.sql", "CREATE TABLE mt_a (id int primary key);"),
  mig("0002_b.sql", "CREATE TABLE mt_b (id int primary key);"),
];

// ── Ordering and checksums (pure) ───────────────────────────────────────────────────────────

test("orders by zero-padded filename, not by locale collation", () => {
  const names = ["0010_j.sql", "0002_b.sql", "0001_a.sql", "notes.md", "0009_i.sql"];
  expect(orderMigrationFiles(names)).toEqual([
    "0001_a.sql",
    "0002_b.sql",
    "0009_i.sql",
    "0010_j.sql",
  ]);
});

test("checksum ignores line-ending differences between a Windows checkout and Linux CI", () => {
  expect(checksumOf("CREATE TABLE x();\nSELECT 1;\n")).toBe(
    checksumOf("CREATE TABLE x();\r\nSELECT 1;\r\n"),
  );
});

test("checksum changes when the SQL actually changes", () => {
  expect(checksumOf("SELECT 1;")).not.toBe(checksumOf("SELECT 2;"));
});

test("every real migration is transactional — none declares the directive", () => {
  // The default is only safe because PostgreSQL DDL is transactional. A migration that needs
  // CREATE INDEX CONCURRENTLY must say so in the file itself.
  for (const m of discoverMigrations()) expect(m.transactional).toBe(true);
});

// ── Transaction-mode directive ──────────────────────────────────────────────────────────────
// This replaced a `NON_TRANSACTIONAL: string[] = []` allowlist that was permanently empty,
// which made the non-transactional branch provably unreachable. The mode now comes from the
// migration file, so both branches are real and both are exercised below.

test("a migration is transactional by default", () => {
  expect(parseTransactionMode("0001_a.sql", "CREATE TABLE x();")).toBe(true);
  expect(parseTransactionMode("0001_a.sql", "-- an ordinary comment\nCREATE TABLE x();")).toBe(
    true,
  );
});

test("the no-transaction directive is honored in the leading comment block", () => {
  expect(parseTransactionMode("0001_a.sql", "-- migrate:no-transaction\nCREATE INDEX y;")).toBe(
    false,
  );
  expect(
    parseTransactionMode("0001_a.sql", "-- why\n\n--   migrate: no-transaction  \nCREATE INDEX y;"),
  ).toBe(false);
});

test("a directive after the leading comment block is NOT a directive", () => {
  // Scanning stops at the first non-comment line, so this cannot be triggered from a SQL
  // string literal or a trailing comment further down the file.
  expect(parseTransactionMode("0001_a.sql", "CREATE TABLE x();\n-- migrate:no-transaction\n")).toBe(
    true,
  );
});

test("an unknown or duplicated directive is rejected, not silently defaulted", () => {
  // A typo in a safety-critical instruction must fail loudly — running a migration in the
  // wrong mode is exactly what this marker exists to prevent.
  expect(() => parseTransactionMode("0001_a.sql", "-- migrate:no-transacton\nSELECT 1;")).toThrow(
    InvalidMigrationDirectiveError,
  );
  expect(() => parseTransactionMode("0001_a.sql", "-- migrate:\nSELECT 1;")).toThrow(
    InvalidMigrationDirectiveError,
  );
  expect(() =>
    parseTransactionMode(
      "0001_a.sql",
      "-- migrate:no-transaction\n-- migrate:no-transaction\nSELECT 1;",
    ),
  ).toThrow(InvalidMigrationDirectiveError);
});

test("directive parsing is linear on the input shape that made the old regex quadratic", () => {
  // The previous pattern was /^--\s*migrate:\s*(\S*)\s*$/. `\s*` … `(\S*)` … `\s*$` gives the
  // engine a split point to retry at every whitespace position, so a line that FAILS to match
  // costs O(n^2). Measured before the change: 10k -> 28ms, 20k -> 108ms, 40k -> 421ms,
  // 80k -> 1700ms. The forward scanner walks the line once and never revisits a position.
  //
  // The budget is deliberately loose — this catches a complexity-class regression, not a slow
  // CI box. The old pattern blew it by orders of magnitude at 200k.
  const pathological = `-- migrate:${" ".repeat(200_000)}a b`;
  const started = performance.now();
  const transactional = parseTransactionMode("0001_a.sql", pathological);
  const elapsed = performance.now() - started;

  expect(elapsed).toBeLessThan(1000);
  // And it still behaves correctly: a token followed by more text is an ordinary comment.
  expect(transactional).toBe(true);
});

test("directive scanning matches the old pattern on every edge case", () => {
  // Equivalence table, kept explicit so the replacement cannot silently narrow the contract.
  const cases: [string, boolean][] = [
    ["-- migrate:no-transaction", false],
    ["--migrate:no-transaction", false], // whitespace after `--` optional
    ["--   migrate:   no-transaction   ", false], // whitespace either side, trailing allowed
    ["--	migrate:	no-transaction", false], // tabs count as whitespace
    ["-- ordinary comment", true],
    ["-- migrate no colon", true], // marker requires the colon
    ["-- not-migrate:no-transaction", true],
  ];
  for (const [line, expected] of cases) {
    expect(parseTransactionMode("0001_a.sql", `${line}\nSELECT 1;`), line).toBe(expected);
  }
});

test("a token followed by more text is an ordinary comment, not a bad directive", () => {
  // `\s*$` in the old pattern required the token to be the whole remainder. Preserved: this
  // must NOT throw, because it never was a directive.
  expect(
    parseTransactionMode("0001_a.sql", "-- migrate:no-transaction and then prose\nSELECT 1;"),
  ).toBe(true);
});

test("the directive is inside the checksum, so flipping the mode is an edit", () => {
  const plain = toMigration("0001_a.sql", "CREATE TABLE x();");
  const marked = toMigration("0001_a.sql", "-- migrate:no-transaction\nCREATE TABLE x();");
  // An applied migration whose mode changed is therefore rejected by the normal checksum guard.
  expect(marked.checksum).not.toBe(plain.checksum);
  expect(marked.transactional).toBe(false);
});

test("directive parsing is line-ending agnostic", () => {
  expect(parseTransactionMode("0001_a.sql", "-- migrate:no-transaction\r\nCREATE INDEX y;")).toBe(
    false,
  );
});

test("the filename comparator pins a locale so CI and a laptop agree", () => {
  expect(byMigrationFilename("0001_a.sql", "0002_b.sql")).toBeLessThan(0);
  expect(byMigrationFilename("0002_b.sql", "0001_a.sql")).toBeGreaterThan(0);
  expect(byMigrationFilename("0001_a.sql", "0001_a.sql")).toBe(0);
});

test("the real migration set is discovered in 0001..0005 order", () => {
  const names = discoverMigrations().map((m) => m.name);
  expect(names.length).toBeGreaterThanOrEqual(5);
  expect([...names]).toEqual([...names].sort());
  expect(names[0]).toStartWith("0001_");
});

// ── Plan consistency (pure) ─────────────────────────────────────────────────────────────────

test("plan marks everything pending against an empty history", () => {
  const plan = buildPlan(SIMPLE, []);
  expect(plan.pending.map((m) => m.name)).toEqual(["0001_a.sql", "0002_b.sql"]);
});

test("plan rejects a historical migration whose file was edited", () => {
  const applied = [{ name: "0001_a.sql", checksum: "deadbeef", appliedAt: new Date() }];
  expect(() => buildPlan(SIMPLE, applied)).toThrow(MigrationChecksumError);
});

test("plan rejects a recorded migration that no longer exists on disk", () => {
  const applied = [{ name: "0000_gone.sql", checksum: "x", appliedAt: new Date() }];
  expect(() => buildPlan(SIMPLE, applied)).toThrow(MissingMigrationError);
});

test("checksum rejection names the migration and refuses to suggest editing it", () => {
  const applied = [{ name: "0001_a.sql", checksum: "aaaa", appliedAt: new Date() }];
  try {
    buildPlan(SIMPLE, applied);
    throw new Error("should have thrown");
  } catch (err) {
    expect((err as Error).message).toContain("0001_a.sql");
    expect((err as Error).message).toContain("add a NEW migration");
  }
});

// ── Apply, rerun, record (real PostgreSQL) ──────────────────────────────────────────────────

test("clean apply creates the schema and exactly one history row per migration", async () => {
  await withDb(async (exec) => {
    const result = await runMigrations(exec, SIMPLE);

    expect(result.applied).toEqual(["0001_a.sql", "0002_b.sql"]);
    const rows = await readApplied(exec);
    expect(rows.map((r) => r.name)).toEqual(["0001_a.sql", "0002_b.sql"]);
    expect(rows[0].checksum).toBe(SIMPLE[0].checksum);
    expect(rows[0].appliedAt).toBeInstanceOf(Date);

    // The DDL genuinely ran.
    await exec.query("INSERT INTO mt_a (id) VALUES (1)");
    await exec.query("INSERT INTO mt_b (id) VALUES (1)");
  });
});

test("rerun is a no-op: nothing applied, no duplicate history rows", async () => {
  await withDb(async (exec) => {
    await runMigrations(exec, SIMPLE);
    const second = await runMigrations(exec, SIMPLE);

    expect(second.applied).toEqual([]);
    expect(second.alreadyApplied).toEqual(["0001_a.sql", "0002_b.sql"]);
    const count = await exec.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM public.schema_migrations",
    );
    expect(count[0].n).toBe("2");
  });
});

test("a new migration appended later applies alone", async () => {
  await withDb(async (exec) => {
    await runMigrations(exec, SIMPLE);
    const extended = [...SIMPLE, mig("0003_c.sql", "CREATE TABLE mt_c (id int primary key);")];

    const result = await runMigrations(exec, extended);

    expect(result.applied).toEqual(["0003_c.sql"]);
    expect((await readApplied(exec)).map((r) => r.name)).toEqual([
      "0001_a.sql",
      "0002_b.sql",
      "0003_c.sql",
    ]);
  });
});

test("an edited historical migration blocks the run BEFORE anything new is applied", async () => {
  await withDb(async (exec) => {
    await runMigrations(exec, SIMPLE);
    const tampered = [
      mig("0001_a.sql", "CREATE TABLE mt_a (id int primary key, extra text);"), // edited
      SIMPLE[1],
      mig("0003_c.sql", "CREATE TABLE mt_c (id int primary key);"), // genuinely pending
    ];

    await expect(runMigrations(exec, tampered)).rejects.toThrow(MigrationChecksumError);

    // The pending migration must NOT have been applied on top of a history we cannot trust.
    const rows = await readApplied(exec);
    expect(rows.map((r) => r.name)).toEqual(["0001_a.sql", "0002_b.sql"]);
  });
});

// ── Failure semantics (real PostgreSQL) ─────────────────────────────────────────────────────

test("a failing migration rolls back its DDL and records no history row", async () => {
  await withDb(async (exec) => {
    const failing = [
      SIMPLE[0],
      mig("0002_bad.sql", "CREATE TABLE mt_ok (id int); SELECT this_function_does_not_exist();"),
    ];

    await expect(runMigrations(exec, failing)).rejects.toThrow(MigrationFailedError);

    // 0001 committed; 0002 left nothing behind — neither the table nor a history row.
    expect((await readApplied(exec)).map((r) => r.name)).toEqual(["0001_a.sql"]);
    const tables = await exec.query<{ c: string }>(
      "SELECT count(*)::text AS c FROM information_schema.tables WHERE table_name = 'mt_ok'",
    );
    expect(tables[0].c).toBe("0");
  });
});

test("a failed run resumes from the failing migration once it is fixed", async () => {
  await withDb(async (exec) => {
    const failing = [SIMPLE[0], mig("0002_b.sql", "SELECT this_function_does_not_exist();")];
    await expect(runMigrations(exec, failing)).rejects.toThrow(MigrationFailedError);

    // Same NAME, corrected SQL. Legal precisely because it was never recorded as applied —
    // the checksum guard only protects migrations that succeeded.
    const result = await runMigrations(exec, SIMPLE);
    expect(result.applied).toEqual(["0002_b.sql"]);
  });
});

test("later migrations do not run after an earlier one fails", async () => {
  await withDb(async (exec) => {
    const set = [
      mig("0001_bad.sql", "SELECT this_function_does_not_exist();"),
      mig("0002_would_be_fine.sql", "CREATE TABLE mt_never (id int);"),
    ];

    await expect(runMigrations(exec, set)).rejects.toThrow(MigrationFailedError);

    const tables = await exec.query<{ c: string }>(
      "SELECT count(*)::text AS c FROM information_schema.tables WHERE table_name = 'mt_never'",
    );
    expect(tables[0].c).toBe("0");
  });
});

test("MigrationFailedError names the migration and keeps the driver cause", async () => {
  await withDb(async (exec) => {
    try {
      await runMigrations(exec, [mig("0001_bad.sql", "SELECT nope_nope();")]);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(MigrationFailedError);
      expect((err as MigrationFailedError).migration).toBe("0001_bad.sql");
      expect((err as MigrationFailedError).cause).toBeDefined();
    }
  });
});

test("a transactional migration ROLLS BACK its partial work on failure", async () => {
  await withDb(async (exec) => {
    await expect(
      runMigrations(exec, [mig("0001_tx.sql", "CREATE TABLE tx_a (id int); SELECT nope();")]),
    ).rejects.toThrow(MigrationFailedError);

    const tables = await exec.query<{ c: string }>(
      "SELECT count(*)::text AS c FROM information_schema.tables WHERE table_name = 'tx_a'",
    );
    expect(tables[0].c).toBe("0");
  });
});

test("a non-transactional migration is NOT wrapped in the runner's BEGIN/COMMIT", async () => {
  await withDb(async (exec) => {
    // This is the observable difference the directive buys, and the reason it exists:
    // statements like CREATE INDEX CONCURRENTLY are refused inside a transaction block.
    const scripts: string[] = [];
    const spy = {
      ...exec,
      script: async (sql: string) => {
        scripts.push(sql);
        await exec.script(sql);
      },
    };

    const nonTx = mig("0001_nt.sql", "-- migrate:no-transaction\nCREATE TABLE nt_a (id int);");
    const tx = mig("0002_tx.sql", "CREATE TABLE tx_b (id int);");

    await runMigrations(spy, [nonTx]);
    expect(scripts).not.toContain("BEGIN");
    expect(scripts).not.toContain("COMMIT");

    scripts.length = 0;
    // Both files on disk now — 0001 is already applied, so only 0002 runs.
    await runMigrations(spy, [nonTx, tx]);
    expect(scripts).toContain("BEGIN");
    expect(scripts).toContain("COMMIT");
  });
});

test("a failed non-transactional migration records no history row, so a rerun retries it", async () => {
  await withDb(async (exec) => {
    const m = mig("0001_nt.sql", "-- migrate:no-transaction\nSELECT nope();");
    await expect(runMigrations(exec, [m])).rejects.toThrow(MigrationFailedError);
    expect(await readApplied(exec)).toEqual([]);
  });
});

test("a non-transactional migration that succeeds is recorded exactly once", async () => {
  await withDb(async (exec) => {
    const m = mig("0001_nt.sql", "-- migrate:no-transaction\nCREATE TABLE nt_ok (id int);");
    expect((await runMigrations(exec, [m])).applied).toEqual(["0001_nt.sql"]);
    expect((await readApplied(exec)).map((r) => r.name)).toEqual(["0001_nt.sql"]);
    expect((await runMigrations(exec, [m])).applied).toEqual([]);
  });
});

// ── Advisory lock (single-session behavior only) ────────────────────────────────────────────

test("the lock is held during the body and released afterwards", async () => {
  await withDb(async (exec) => {
    const heldDuring = await withMigrationLock(exec, async () => {
      const rows = await exec.query<{ c: string }>(
        `SELECT count(*)::text AS c FROM pg_locks
          WHERE locktype = 'advisory' AND classid = $1 AND objid = $2`,
        [MIGRATION_LOCK_KEYS.namespace, MIGRATION_LOCK_KEYS.id],
      );
      return rows[0].c;
    });
    expect(heldDuring).toBe("1");

    const after = await exec.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM pg_locks
        WHERE locktype = 'advisory' AND classid = $1 AND objid = $2`,
      [MIGRATION_LOCK_KEYS.namespace, MIGRATION_LOCK_KEYS.id],
    );
    expect(after[0].c).toBe("0");
  });
});

test("the lock is released when the body throws — a crashed run cannot wedge the next one", async () => {
  await withDb(async (exec) => {
    await expect(
      withMigrationLock(exec, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const after = await exec.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM pg_locks
        WHERE locktype = 'advisory' AND classid = $1 AND objid = $2`,
      [MIGRATION_LOCK_KEYS.namespace, MIGRATION_LOCK_KEYS.id],
    );
    expect(after[0].c).toBe("0");
  });
});

test("a failed migration leaves no advisory lock behind", async () => {
  await withDb(async (exec) => {
    await expect(runMigrations(exec, [mig("0001_bad.sql", "SELECT nope_nope();")])).rejects.toThrow(
      MigrationFailedError,
    );

    const after = await exec.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM pg_locks
        WHERE locktype = 'advisory' AND classid = $1 AND objid = $2`,
      [MIGRATION_LOCK_KEYS.namespace, MIGRATION_LOCK_KEYS.id],
    );
    expect(after[0].c).toBe("0");
  });
});

// ── Status ──────────────────────────────────────────────────────────────────────────────────

test("status reports applied and pending without applying anything", async () => {
  await withDb(async (exec) => {
    await runMigrations(exec, [SIMPLE[0]]);

    const { plan } = await migrationStatus(exec, SIMPLE);

    expect(plan.entries).toEqual([
      { name: "0001_a.sql", state: "applied", checksum: SIMPLE[0].checksum },
      {
        name: "0002_b.sql",
        state: "pending",
        checksum: SIMPLE[1].checksum,
        transactional: true,
      },
    ]);
    // Still only one row — status is read-only over the history.
    expect(await readApplied(exec)).toHaveLength(1);
  });
});

test("status fails the same way a real run would on a tampered history", async () => {
  await withDb(async (exec) => {
    await ensureMigrationTable(exec);
    await exec.query(
      `INSERT INTO public.schema_migrations (name, checksum) VALUES ('0001_a.sql', 'wrong')`,
    );
    await expect(migrationStatus(exec, SIMPLE)).rejects.toThrow(MigrationChecksumError);
  });
});

// ── The real migration set applies end to end ───────────────────────────────────────────────

test("the real db/pg/migrations set applies cleanly and reruns as a no-op", async () => {
  await withDb(async (exec) => {
    const real = discoverMigrations();

    const first = await runMigrations(exec, real);
    expect(first.applied).toEqual(real.map((m) => m.name));

    // The content schema the migrations are supposed to produce actually exists.
    const schema = await exec.query<{ c: string }>(
      "SELECT count(*)::text AS c FROM information_schema.schemata WHERE schema_name = 'content'",
    );
    expect(schema[0].c).toBe("1");

    const second = await runMigrations(exec, real);
    expect(second.applied).toEqual([]);
  });
});
