import { test, expect } from "bun:test";

import {
  postgresExec,
  createRuntimeExec,
  closeRuntimeClients,
  RUNTIME_CLIENT_OPTIONS,
} from "./pg-adapter";

/** Minimal fake of the postgres.js surface the adapter uses; records the calls it makes. */
function makeFakeSql() {
  const calls: string[] = [];
  const sql: {
    unsafe: (t: string, p?: unknown[], o?: { prepare?: boolean }) => Promise<unknown[]>;
    begin: (fn: (s: typeof sql) => Promise<unknown>) => Promise<unknown>;
    savepoint: (fn: (s: typeof sql) => Promise<unknown>) => Promise<unknown>;
    end: (o?: { timeout?: number }) => Promise<void>;
  } = {
    unsafe: (_t, _p, o) => {
      calls.push(`unsafe:${o?.prepare === true ? "prepared" : "raw"}`);
      return Promise.resolve([]);
    },
    begin: (fn) => {
      calls.push("begin");
      return fn(sql);
    },
    savepoint: (fn) => {
      calls.push("savepoint");
      return fn(sql);
    },
    end: () => {
      calls.push("end");
      return Promise.resolve();
    },
  };
  return { sql, calls };
}

test("root tx uses begin; a nested tx uses savepoint (not a second begin)", async () => {
  const { sql, calls } = makeFakeSql();
  const exec = postgresExec(sql as never);
  await exec.tx(async (tx) => {
    await tx.tx(async (inner) => {
      await inner.query("SELECT 1");
    });
  });
  expect(calls).toEqual(["begin", "savepoint", "unsafe:prepared"]);
});

test("queries run as prepared statements", async () => {
  const { sql, calls } = makeFakeSql();
  await postgresExec(sql as never).query("SELECT 1");
  expect(calls).toContain("unsafe:prepared");
});

test("runtime client options: single connection, prepared, bounded timeouts", () => {
  expect(RUNTIME_CLIENT_OPTIONS.max).toBe(1);
  expect(RUNTIME_CLIENT_OPTIONS.prepare).toBe(true);
  expect(RUNTIME_CLIENT_OPTIONS.connect_timeout).toBeGreaterThan(0);
  expect(RUNTIME_CLIENT_OPTIONS.connection.statement_timeout).toBeDefined();
  expect(RUNTIME_CLIENT_OPTIONS.connection.idle_in_transaction_session_timeout).toBeDefined();
});

test("one client is cached per config; closeRuntimeClients ends it", async () => {
  const { sql, calls } = makeFakeSql();
  let connects = 0;
  const connect = async () => {
    connects += 1;
    return sql as never;
  };
  const a = await createRuntimeExec({ DATABASE_URL: "postgres://x/y" }, connect);
  const b = await createRuntimeExec({ DATABASE_URL: "postgres://x/y" }, connect);
  expect(a).toBe(b);
  expect(connects).toBe(1); // no new unmanaged client per call
  await closeRuntimeClients();
  expect(calls).toContain("end");
});
