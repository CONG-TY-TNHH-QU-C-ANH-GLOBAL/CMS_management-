import { test, expect } from "bun:test";

import { postgresExec, createRequestPgScope, RUNTIME_CLIENT_OPTIONS } from "./pg-adapter";
import { ContentError } from "./content.errors";

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

test("runtime client options: bounded numeric timeouts, prepared, single connection", () => {
  const o = RUNTIME_CLIENT_OPTIONS;
  expect(o.max).toBe(1); // explicitly bounded
  expect(o.prepare).toBe(true);
  expect(typeof o.connect_timeout).toBe("number");
  expect(o.connect_timeout).toBeGreaterThan(0);
  expect(typeof o.connection.statement_timeout).toBe("number");
  expect(o.connection.statement_timeout).toBeGreaterThan(0);
  expect(Number.isNaN(o.connection.statement_timeout)).toBe(false);
  expect(typeof o.connection.idle_in_transaction_session_timeout).toBe("number");
  expect(o.connection.idle_in_transaction_session_timeout).toBeGreaterThan(0);
});

test("request scope: missing HYPERDRIVE and DATABASE_URL → ContentError db_unavailable", async () => {
  const scope = createRequestPgScope({});
  await expect(scope.getExec()).rejects.toMatchObject({
    code: "db_unavailable",
  } as Partial<ContentError>);
});

test("request scope: concurrent getExec() share ONE connection attempt", async () => {
  const { sql } = makeFakeSql();
  let connects = 0;
  const connect = async () => {
    connects += 1;
    return sql as never;
  };
  const scope = createRequestPgScope({ DATABASE_URL: "postgres://u:p@h/db" }, connect);
  const [a, b] = await Promise.all([scope.getExec(), scope.getExec()]);
  expect(connects).toBe(1);
  expect(a).toBe(b);
  await scope.close();
});

test("request scope: separate scopes do NOT share a client", async () => {
  let connects = 0;
  const connect = async () => {
    connects += 1;
    return makeFakeSql().sql as never;
  };
  const env = { DATABASE_URL: "postgres://u:p@h/db" };
  const s1 = createRequestPgScope(env, connect);
  const s2 = createRequestPgScope(env, connect);
  const e1 = await s1.getExec();
  const e2 = await s2.getExec();
  expect(connects).toBe(2);
  expect(e1).not.toBe(e2);
  await s1.close();
  await s2.close();
});

test("request scope: a failed connect is not retained (retryable)", async () => {
  let attempts = 0;
  const connect = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("connect boom");
    return makeFakeSql().sql as never;
  };
  const scope = createRequestPgScope({ DATABASE_URL: "postgres://u:p@h/db" }, connect);
  await expect(scope.getExec()).rejects.toThrow("connect boom");
  await expect(scope.getExec()).resolves.toBeDefined(); // state was cleared; second attempt succeeds
  expect(attempts).toBe(2);
  await scope.close();
});

test("request scope: close during acquisition — getExec rejects, no executor, end runs exactly once", async () => {
  const { sql, calls } = makeFakeSql();
  let release: (v: typeof sql) => void = () => {};
  const connect = () => new Promise<typeof sql>((r) => (release = r));
  const scope = createRequestPgScope({ DATABASE_URL: "postgres://u:p@h/db" }, connect as never);
  const getting = scope.getExec(); // acquisition begins
  const closing = scope.close(); // close begins BEFORE connect resolves
  release(sql); // connect resolves
  // getExec must REJECT (bounded db_unavailable) and return no executor…
  await expect(getting).rejects.toMatchObject({ code: "db_unavailable" });
  await closing; // …and close (the sole lifecycle owner) completes,
  await scope.close(); // is idempotent,
  expect(calls.filter((c) => c === "end")).toHaveLength(1); // …ending the client exactly once.
});
