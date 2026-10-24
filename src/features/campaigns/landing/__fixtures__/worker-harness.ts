// Test-only harness: runs PRODUCTION modules (src/server.ts, landing.server.ts, the real auth
// service, CSRF check, audit log and Telegram dispatcher) against real SQLite with only the
// Worker boundaries stubbed. Same isolation idea as campaigns.integration.test.ts: every module
// is transpiled and evaluated by a private loader, so no bun `mock.module` leaks into other
// test files. Modules run in THIS realm (not a vm context) so Uint8Array / Error / Response
// identities stay the same on both sides.
//
// Boundaries (and only these) are replaced:
//   cloudflare:workers                 env (DB → bun:sqlite, MEDIA → in-memory R2, CMS_REV KV)
//   @tanstack/react-start/server       getRequest() → the request the test is "serving"
//   @tanstack/react-start              createServerFn → a callable running validator + handler
//   @tanstack/react-router             createFileRoute → the options object
//   @tanstack/react-start/server-entry the CMS app (recorder)
//   telegram.outbox                    no network flush (the outbox row is the observable)
//   careers/landing-rebuild            no-op
// `fetch` inside production modules throws, so no code path can reach the network.

import { Database } from "bun:sqlite";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import ts from "typescript";

const SRC = resolve(import.meta.dir, "../../../..");
const MIGRATIONS = resolve(SRC, "../db/migrations");
const dependencyRequire = createRequire(import.meta.url);

// ── D1 over bun:sqlite (prepare/bind/first/all/run/batch) ────────────────────
export function d1(sql: () => Database): D1Database {
  const bound = (query: string, args: unknown[]) => ({
    bind: (...values: unknown[]) => bound(query, values),
    execute() {
      const result = sql()
        .query(query)
        .run(...(args as never[]));
      return { success: true, meta: { changes: result.changes } };
    },
    async first() {
      return (
        sql()
          .query(query)
          .get(...(args as never[])) ?? null
      );
    },
    async all() {
      return {
        results: sql()
          .query(query)
          .all(...(args as never[])),
      };
    },
    async run() {
      return this.execute();
    },
  });
  return {
    prepare: (query: string) => bound(query, []),
    async batch(statements: { execute(): unknown }[]) {
      return sql().transaction(() => statements.map((s) => s.execute()))();
    },
  } as unknown as D1Database;
}

// ── R2 in memory (keys are opaque strings, exactly like R2) ──────────────────
export function memoryR2() {
  const store = new Map<string, Uint8Array>();
  const gets: string[] = [];
  const objectOf = (key: string, data: Uint8Array) => ({
    key,
    size: data.byteLength,
    httpEtag: `"${data.byteLength}-${key.length}"`,
    body: new Blob([data as BlobPart]).stream(),
    text: async () => new TextDecoder().decode(data),
  });
  const bucket = {
    async put(key: string, value: Uint8Array | string) {
      store.set(
        key,
        typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value),
      );
      return null;
    },
    async get(key: string) {
      gets.push(key);
      const data = store.get(key);
      return data ? objectOf(key, data) : null;
    },
    async head(key: string) {
      gets.push(key);
      const data = store.get(key);
      return data
        ? { size: data.byteLength, httpEtag: `"${data.byteLength}-${key.length}"` }
        : null;
    },
  };
  return { bucket: bucket as unknown as R2Bucket, store, gets };
}

/** Every migration applied once; callers deserialize a fresh copy per test. */
export function migratedSnapshot(seed = ""): Uint8Array {
  const fresh = new Database(":memory:");
  for (const file of readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    fresh.exec(readFileSync(resolve(MIGRATIONS, file), "utf8"));
  }
  if (seed) fresh.exec(seed);
  const bytes = fresh.serialize();
  fresh.close();
  return bytes;
}

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => resolve(MIGRATIONS, f));
}

// ── Module loader ────────────────────────────────────────────────────────────
export interface Loader {
  load<T = Record<string, unknown>>(absolute: string): T;
  src(relative: string): string;
}

const toFile = (base: string) =>
  [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, base].find((p) => existsSync(p)) ??
  `${base}.ts`;

/**
 * `boundaries` maps an import id (as written) OR an absolute source path (without extension
 * handling: pass the resolved .ts path) to the object that module should be.
 */
export function createLoader(
  boundaries: Record<string, unknown>,
  importMeta: { env: { PROD: boolean } } = { env: { PROD: true } },
): Loader {
  const modules = new Map<string, { exports: unknown }>();
  const noNetwork = () => {
    throw new Error("Network call from a production code path under test");
  };

  function load(absolute: string): unknown {
    if (absolute in boundaries) return boundaries[absolute];
    if (modules.has(absolute)) return modules.get(absolute)!.exports;
    const module = { exports: {} as Record<string, unknown> };
    modules.set(absolute, module);
    const code = ts
      .transpileModule(readFileSync(absolute, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      })
      .outputText.replaceAll("import.meta", "__importMeta");
    const scopedRequire = (id: string): unknown => {
      if (id in boundaries) return boundaries[id];
      if (id.endsWith("?raw")) {
        const file = resolve(dirname(absolute), id.slice(0, -4));
        return { __esModule: true, default: readFileSync(file, "utf8") };
      }
      if (id.startsWith("@/")) return load(toFile(resolve(SRC, id.slice(2))));
      if (id.startsWith(".")) return load(toFile(resolve(dirname(absolute), id)));
      return dependencyRequire(id);
    };
    const run = new Function("module", "exports", "require", "__importMeta", "fetch", code);
    run(module, module.exports, scopedRequire, importMeta, noNetwork);
    return module.exports;
  }

  return {
    load: <T>(absolute: string) => load(absolute) as T,
    src: (relative: string) => toFile(resolve(SRC, relative)),
  };
}

export const srcPath = (relative: string) => toFile(resolve(SRC, relative));

/** Stub for createServerFn: `.inputValidator(v).handler(h)` returns `(data) => h({ data: v(data) })`. */
export const serverFnStub = {
  createServerFn: () => {
    let validator: (data: unknown) => unknown = (d) => d;
    const builder = {
      inputValidator(v: (data: unknown) => unknown) {
        validator = v;
        return builder;
      },
      handler(h: (ctx: { data: unknown }) => unknown) {
        return async (data: unknown) => h({ data: validator(data) });
      },
    };
    return builder;
  },
};

export const fileRouteStub = {
  createFileRoute: (path: string) => (options: unknown) => ({ path, options }),
};
