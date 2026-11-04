import { afterEach, beforeEach, expect, setSystemTime, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

import * as cookies from "./auth.cookies";
import { createLoginDiagnostic, LOGIN_DIAGNOSTICS_UNTIL } from "./auth.diagnostics";

const captureOutput = () => spyOn(console, "info").mockImplementation(() => {});
let output: ReturnType<typeof captureOutput>;
beforeEach(() => {
  setSystemTime(new Date("2026-11-04T04:00:00Z"));
  output = captureOutput();
});
afterEach(() => {
  output.mockRestore();
  setSystemTime();
});
const records = (): Record<string, unknown>[] =>
  output.mock.calls.map(([line]) => JSON.parse(String(line)));

test("correlates provider, mapping and issuance without logging raw identity", async () => {
  const trace = createLoginDiagnostic();
  await trace.provider(" PRIVATE@example.test ", true);
  trace.mapped(6, "admin", true);
  trace.issued(6);
  const rows = records();
  expect(rows.map((row) => row.stage)).toEqual(["provider", "mapped", "issued"]);
  expect(new Set(rows.map((row) => row.correlationId)).size).toBe(1);
  expect(rows[0].correlationId).toBe(trace.correlationId);
  expect(rows[0].timestamp).toBe("2026-11-04T04:00:00.000Z");
  expect(rows[0].event).toBe("auth.login.diagnostic");
  expect(rows[0].emailVerified).toBe(true);
  expect(rows[0].emailFingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect(rows[1]).toMatchObject({ userId: 6, role: "admin", emailMatchesProvider: true });
  expect(rows[2]).toMatchObject({ userId: 6 });
  expect(JSON.stringify(rows).toLowerCase()).not.toContain("private@example.test");
  expect(Object.keys(rows[0]).sort()).toEqual([
    "correlationId",
    "emailFingerprint",
    "emailVerified",
    "event",
    "level",
    "stage",
    "timestamp",
  ]);
});

test("canonicalizes the email fingerprint and separates different accounts", async () => {
  const trace = createLoginDiagnostic();
  await trace.provider(" TAN@example.test ", true);
  await trace.provider("tan@example.test", true);
  await trace.provider("nhan@example.test", true);
  const rows = records();
  expect(rows[0].emailFingerprint).toBe(rows[1].emailFingerprint);
  expect(rows[0].emailFingerprint).not.toBe(rows[2].emailFingerprint);
});

test("uses separate correlation IDs for concurrent attempts", async () => {
  const a = createLoginDiagnostic();
  const b = createLoginDiagnostic();
  await Promise.all([a.provider("a@example.test", true), b.provider("b@example.test", false)]);
  expect(a.correlationId).not.toBe(b.correlationId);
  expect(
    records()
      .map((row) => row.emailVerified)
      .sort(),
  ).toEqual([false, true]);
});

test("failure records contain only a bounded reason", () => {
  const trace = createLoginDiagnostic();
  trace.failed("email_not_invited");
  expect(records()[0]).toMatchObject({
    stage: "failed",
    level: "warn",
    reason: "email_not_invited",
  });
  expect(Object.keys(records()[0]).sort()).toEqual([
    "correlationId",
    "event",
    "level",
    "reason",
    "stage",
    "timestamp",
  ]);
});

test("emits nothing and exposes no diagnostic ID at or after the cutoff", async () => {
  setSystemTime(new Date(LOGIN_DIAGNOSTICS_UNTIL));
  const trace = createLoginDiagnostic();
  await trace.provider("secret@example.test", true);
  trace.mapped(9, "editor", false);
  trace.issued(9);
  trace.failed("session_issue_failed");
  expect(trace.correlationId).toBeUndefined();
  expect(records()).toEqual([]);
});

test("an attempt begun before expiry also stops logging when the cutoff passes", () => {
  const trace = createLoginDiagnostic();
  expect(trace.correlationId).toBeString();
  setSystemTime(new Date(LOGIN_DIAGNOSTICS_UNTIL));
  trace.issued(6);
  expect(records()).toEqual([]);
});

test("a failed logging sink cannot fail authentication", async () => {
  output.mockImplementation(() => {
    throw new Error("sink unavailable");
  });
  const trace = createLoginDiagnostic();
  await expect(trace.provider("private@example.test", true)).resolves.toBeUndefined();
  expect(() => trace.issued(6)).not.toThrow();
});

type Scenario =
  | "success"
  | "unverified"
  | "not_invited"
  | "provider_failed"
  | "session_failed"
  | "different_uncached"
  | "probe_failed";

function callbackFixture(scenario: Scenario = "success") {
  const calls: string[] = [];
  const providerInfo = { email: "private@example.test", email_verified: scenario !== "unverified" };
  let handler: ((context: { request: Request }) => Promise<Response>) | undefined;
  const auth = {
    OAUTH_REDIRECT_COOKIE: cookies.OAUTH_REDIRECT_COOKIE,
    OAUTH_STATE_COOKIE: cookies.OAUTH_STATE_COOKIE,
    isProduction: () => true,
    async exchangeCodeForTokens(code: string) {
      calls.push("exchange");
      expect(code).toBe("SECRET_AUTH_CODE");
      if (scenario === "provider_failed") throw new Error("provider unavailable");
      return { access_token: "SECRET_ACCESS_TOKEN" };
    },
    async fetchGoogleUserInfo(token: string, cache?: "no-store") {
      calls.push(cache ? "userinfo_uncached" : "userinfo");
      expect(token).toBe("SECRET_ACCESS_TOKEN");
      if (cache && scenario === "probe_failed") throw new Error("uncached probe unavailable");
      if (cache && scenario === "different_uncached")
        return { email: "other-private@example.test", email_verified: true };
      return providerInfo;
    },
    async upsertGoogleUser(info: unknown) {
      calls.push("map");
      expect(info).toBe(providerInfo);
      if (scenario === "not_invited")
        throw Object.assign(new Error("not invited"), { code: "EMAIL_NOT_INVITED" });
      return { id: 6, email: providerInfo.email, role: "admin" };
    },
    async issueSession(user: { id: number }) {
      calls.push("issue");
      expect(user.id).toBe(6);
      if (scenario === "session_failed")
        throw Object.assign(new Error("cleanup"), { code: "SESSION_CLEANUP_FAILED" });
      return "__Host-thg_sid=SECRET_SESSION; Path=/; HttpOnly; Secure";
    },
  };
  const source = readFileSync(
    new URL("../../routes/api/auth/google/callback.ts", import.meta.url),
    "utf8",
  );
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const boundaryRequire = (id: string): unknown => {
    if (id === "@tanstack/react-router")
      return {
        createFileRoute: () => (options: { server: { handlers: { GET: typeof handler } } }) => {
          handler = options.server.handlers.GET;
        },
      };
    if (id === "@/core/middlewares/rate-limit")
      return { getClientIp: () => "127.0.0.1", rateLimit: async () => ({ allowed: true }) };
    if (id === "@/features/auth") return auth;
    if (id === "@/features/auth/auth.cookies") return cookies;
    if (id === "@/features/auth/auth.diagnostics") return { createLoginDiagnostic };
    throw new Error(`Unexpected callback import: ${id}`);
  };
  runInNewContext(code, {
    exports: {},
    require: boundaryRequire,
    console: { error() {} },
    URL,
    URLSearchParams,
    Response,
    Headers,
  });
  return {
    calls,
    async invoke(validState = true) {
      if (!handler) throw new Error("Callback handler was not registered");
      return handler({
        request: new Request(
          "https://cms.example.test/api/auth/google/callback?code=SECRET_AUTH_CODE&state=valid-state",
          {
            headers: {
              cookie: `__Host-thg_oauth_state=${validState ? "valid-state" : "invalid"}; __Host-thg_oauth_redirect=%2Fadmin`,
            },
          },
        ),
      });
    },
  };
}

test("real callback preserves session cookies/redirect and links the diagnostic header", async () => {
  const fixture = callbackFixture();
  const response = await fixture.invoke();
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("/admin");
  expect(response.headers.get("set-cookie")).toContain("__Host-thg_sid=SECRET_SESSION");
  expect(response.headers.get("set-cookie")).toContain(
    "__Host-thg_oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure",
  );
  expect(fixture.calls).toEqual(["exchange", "userinfo", "userinfo_uncached", "map", "issue"]);
  const rows = records();
  expect(rows.map((row) => row.stage)).toEqual([
    "provider",
    "provider_uncached",
    "mapped",
    "issued",
  ]);
  expect(response.headers.get("x-thg-auth-trace")).toBe(String(rows[0].correlationId));
  for (const secret of [
    "SECRET_AUTH_CODE",
    "SECRET_ACCESS_TOKEN",
    "SECRET_SESSION",
    "private@example.test",
    "valid-state",
  ]) {
    expect(JSON.stringify(rows)).not.toContain(secret);
  }
});

for (const [scenario, reason, stages] of [
  ["unverified", "email_not_verified", ["provider", "failed"]],
  ["not_invited", "email_not_invited", ["provider", "provider_uncached", "failed"]],
  ["provider_failed", "token_exchange_failed", ["failed"]],
  ["session_failed", "session_init_failed", ["provider", "provider_uncached", "mapped", "failed"]],
] satisfies [Scenario, string, string[]][]) {
  test(`real callback retains the ${scenario} rejection without issuing a session`, async () => {
    const response = await callbackFixture(scenario).invoke();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`/login?error=${reason}`);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(records().map((row) => row.stage)).toEqual(stages);
  });
}

test("invalid OAuth state still stops before any provider call or diagnostic", async () => {
  const fixture = callbackFixture();
  expect((await fixture.invoke(false)).headers.get("location")).toBe("/login?error=invalid_state");
  expect(fixture.calls).toEqual([]);
  expect(records()).toEqual([]);
});

test("expired diagnostics leave the real callback successful without trace headers", async () => {
  setSystemTime(new Date(LOGIN_DIAGNOSTICS_UNTIL));
  const fixture = callbackFixture();
  const response = await fixture.invoke();
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("/admin");
  expect(response.headers.get("x-thg-auth-trace")).toBeNull();
  expect(records()).toEqual([]);
  expect(fixture.calls).toEqual(["exchange", "userinfo", "map", "issue"]);
});

test("different uncached provider data is recorded but never substituted as the login identity", async () => {
  const fixture = callbackFixture("different_uncached");
  const response = await fixture.invoke();
  const rows = records();
  expect(rows[0].stage).toBe("provider");
  expect(rows[1].stage).toBe("provider_uncached");
  expect(rows[0].emailFingerprint).not.toBe(rows[1].emailFingerprint);
  expect(rows[2]).toMatchObject({ stage: "mapped", userId: 6, emailMatchesProvider: true });
  expect(response.status).toBe(302);
  expect(response.headers.get("set-cookie")).toContain("__Host-thg_sid=SECRET_SESSION");
  expect(JSON.stringify(rows)).not.toContain("other-private@example.test");
});

test("a failed uncached comparison does not block the original successful login", async () => {
  const response = await callbackFixture("probe_failed").invoke();
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("/admin");
  expect(records().map((row) => row.stage)).toEqual([
    "provider",
    "unavailable",
    "mapped",
    "issued",
  ]);
});
