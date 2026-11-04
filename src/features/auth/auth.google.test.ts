import { test, expect, describe, beforeEach, mock, spyOn } from "bun:test";

// The auth module reads its config from the `cloudflare:workers` env binding, which bun:test cannot
// resolve. Stub it with a MUTABLE object so each test controls the config, then import the module (its
// guards read env at call time, so mutating between tests is enough). No real credentials, no network.
const fakeEnv: Record<string, string> = {};
mock.module("cloudflare:workers", () => ({ env: fakeEnv }));
mock.module("@/core/db/env", () => ({}));

const {
  buildGoogleAuthUrl,
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
  OAuthConfigError,
  GoogleProviderError,
} = await import("./auth.google");

const CLIENT_ID = "test-client-id.apps.googleusercontent.com";
const SECRET_SENTINEL = "super-secret-value-DO-NOT-LEAK";

test("the diagnostic no-store mode changes only cache policy for the same UserInfo token", async () => {
  const requests: {
    url: string;
    authorization: string | null;
    cache: RequestCache | undefined;
    bounded: boolean;
  }[] = [];
  const response = async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    requests.push({
      url: String(input),
      authorization: new Headers(init?.headers).get("Authorization"),
      cache: init?.cache,
      bounded: init?.signal instanceof AbortSignal,
    });
    return Response.json({
      sub: "provider-subject",
      email: "private@example.test",
      email_verified: true,
    });
  };
  const network = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(response, { preconnect() {} }),
  );
  try {
    const original = await fetchGoogleUserInfo("SECRET_TOKEN");
    const uncached = await fetchGoogleUserInfo("SECRET_TOKEN", "no-store");
    expect(original.email).toBe("private@example.test");
    expect(uncached.email).toBe(original.email);
    expect(requests).toEqual([
      {
        url: "https://www.googleapis.com/oauth2/v3/userinfo",
        authorization: "Bearer SECRET_TOKEN",
        cache: undefined,
        bounded: false,
      },
      {
        url: "https://www.googleapis.com/oauth2/v3/userinfo",
        authorization: "Bearer SECRET_TOKEN",
        cache: "no-store",
        bounded: true,
      },
    ]);
  } finally {
    network.mockRestore();
  }
});

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

  test("a valid client ID with surrounding whitespace is trimmed in the authorization URL", () => {
    fakeEnv.GOOGLE_CLIENT_ID = `\t  ${CLIENT_ID}  \n`;
    const parsed = new URL(buildGoogleAuthUrl("state123"));
    expect(parsed.searchParams.get("client_id")).toBe(CLIENT_ID); // trimmed, not the raw padded value
  });

  test("a whitespace-only GOOGLE_CLIENT_SECRET is treated as missing (before any network call)", async () => {
    fakeEnv.GOOGLE_CLIENT_ID = CLIENT_ID;
    fakeEnv.GOOGLE_CLIENT_SECRET = "   \t";
    let fetched = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetched = true;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    try {
      await expect(exchangeCodeForTokens("auth-code")).rejects.toBeInstanceOf(OAuthConfigError);
      expect(fetched).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
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

  test("a failed token exchange exposes bounded provider metadata and never the client secret", async () => {
    fakeEnv.GOOGLE_CLIENT_ID = CLIENT_ID;
    fakeEnv.GOOGLE_CLIENT_SECRET = SECRET_SENTINEL; // both configured → guard passes, network is reached
    const RAW_BODY =
      '{"error":"invalid_grant","error_description":"RAW-BODY-SENTINEL-do-not-leak"}';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(RAW_BODY, { status: 400 })) as unknown as typeof fetch;

    // Invoke exactly ONCE, capture the single rejection, and assert every requirement on that one error.
    let captured: unknown;
    try {
      await exchangeCodeForTokens("auth-code");
    } catch (e) {
      captured = e;
    } finally {
      globalThis.fetch = originalFetch;
    }

    // Fails clearly (not silently) if the function unexpectedly resolved — `captured` stays undefined.
    expect(captured).toBeInstanceOf(GoogleProviderError);
    const msg = (captured as Error).message;
    expect(msg).toMatch(/token exchange failed/i); // bounded operation label
    expect(msg).toContain("400"); // safe metadata: HTTP status
    expect(msg).toContain("invalid_grant"); // safe metadata: validated short provider code
    expect(msg).not.toContain(SECRET_SENTINEL); // client secret never in the error
    expect(msg).not.toContain("RAW-BODY-SENTINEL-do-not-leak"); // raw provider body is discarded
    expect(msg).not.toContain("error_description"); // discarded provider detail never surfaced
  });
});
