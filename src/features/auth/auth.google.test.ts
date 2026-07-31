import { test, expect, describe, beforeEach, mock } from "bun:test";

// The auth module reads its config from the `cloudflare:workers` env binding, which bun:test cannot
// resolve. Stub it with a MUTABLE object so each test controls the config, then import the module (its
// guards read env at call time, so mutating between tests is enough). No real credentials, no network.
const fakeEnv: Record<string, string> = {};
mock.module("cloudflare:workers", () => ({ env: fakeEnv }));
mock.module("@/core/db/env", () => ({}));

const { buildGoogleAuthUrl, exchangeCodeForTokens, OAuthConfigError } =
  await import("./auth.google");

const CLIENT_ID = "test-client-id.apps.googleusercontent.com";
const SECRET_SENTINEL = "super-secret-value-DO-NOT-LEAK";

beforeEach(() => {
  for (const key of Object.keys(fakeEnv)) delete fakeEnv[key];
  fakeEnv.OAUTH_REDIRECT_BASE = "http://localhost:8080";
});

describe("Google OAuth configuration guard", () => {
  test("buildGoogleAuthUrl throws OAuthConfigError when GOOGLE_CLIENT_ID is missing (no Google redirect is built)", () => {
    expect(() => buildGoogleAuthUrl("state123")).toThrow(OAuthConfigError);
  });

  test("a whitespace-only GOOGLE_CLIENT_ID is treated as missing", () => {
    fakeEnv.GOOGLE_CLIENT_ID = "   ";
    expect(() => buildGoogleAuthUrl("state123")).toThrow(OAuthConfigError);
  });

  test("the config error names only the missing VARIABLE, never a value", () => {
    try {
      buildGoogleAuthUrl("state123");
      throw new Error("expected buildGoogleAuthUrl to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(OAuthConfigError);
      expect((e as Error).message).toBe(
        "Google OAuth is not configured: GOOGLE_CLIENT_ID is missing",
      );
    }
  });

  test("a configured client ID appears in the Google authorization URL (never empty)", () => {
    fakeEnv.GOOGLE_CLIENT_ID = CLIENT_ID;
    const parsed = new URL(buildGoogleAuthUrl("state123"));
    expect(`${parsed.origin}${parsed.pathname}`).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(parsed.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(parsed.searchParams.get("client_id")).not.toBe("");
    expect(parsed.searchParams.get("state")).toBe("state123");
  });

  test("token exchange rejects with OAuthConfigError (before any network call) when GOOGLE_CLIENT_SECRET is missing", async () => {
    fakeEnv.GOOGLE_CLIENT_ID = CLIENT_ID; // id present, secret absent
    let fetched = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetched = true;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    try {
      await expect(exchangeCodeForTokens("auth-code")).rejects.toBeInstanceOf(OAuthConfigError);
      expect(fetched).toBe(false); // guard fires before the token endpoint is contacted
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("the missing-secret config error names the variable, not its value", async () => {
    fakeEnv.GOOGLE_CLIENT_ID = CLIENT_ID;
    try {
      await exchangeCodeForTokens("auth-code");
      throw new Error("expected exchangeCodeForTokens to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(OAuthConfigError);
      expect((e as Error).message).toBe(
        "Google OAuth is not configured: GOOGLE_CLIENT_SECRET is missing",
      );
    }
  });

  test("a failed token exchange surfaces the provider response and NEVER the client secret value", async () => {
    fakeEnv.GOOGLE_CLIENT_ID = CLIENT_ID;
    fakeEnv.GOOGLE_CLIENT_SECRET = SECRET_SENTINEL; // both configured → guard passes, network is reached
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("invalid_grant", { status: 400 })) as unknown as typeof fetch;
    try {
      await expect(exchangeCodeForTokens("auth-code")).rejects.toThrow(/token exchange failed/i);
      try {
        await exchangeCodeForTokens("auth-code");
      } catch (e) {
        // The error carries Google's RESPONSE, never the request body's client_secret.
        expect((e as Error).message).not.toContain(SECRET_SENTINEL);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
