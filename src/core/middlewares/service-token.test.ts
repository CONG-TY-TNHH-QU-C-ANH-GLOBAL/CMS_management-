import { describe, expect, test } from "bun:test";

import { bearerToken, checkServiceToken, serviceTokenRefusal } from "./service-token";

const req = (headers: Record<string, string> = {}) =>
  new Request("https://cms.thgfulfill.com/api/v1/agent/events", { method: "POST", headers });

describe("bearerToken", () => {
  test("reads the token from a well-formed header", () => {
    expect(bearerToken(req({ authorization: "Bearer abc123" }))).toBe("abc123");
    // The scheme is case-insensitive per RFC 7235; clients spell it every way.
    expect(bearerToken(req({ authorization: "bearer abc123" }))).toBe("abc123");
    expect(bearerToken(req({ authorization: "  Bearer   abc123  " }))).toBe("abc123");
  });

  test("rejects anything that is not exactly one bearer token", () => {
    expect(bearerToken(req())).toBeNull();
    expect(bearerToken(req({ authorization: "abc123" }))).toBeNull();
    expect(bearerToken(req({ authorization: "Basic abc123" }))).toBeNull();
    expect(bearerToken(req({ authorization: "Bearer" }))).toBeNull();
    // Two words after the scheme is a malformed header, not a token containing a
    // space — accepting the first word would authenticate a truncated secret.
    expect(bearerToken(req({ authorization: "Bearer abc 123" }))).toBeNull();
  });
});

describe("checkServiceToken", () => {
  test("accepts the exact secret", () => {
    expect(checkServiceToken(req({ authorization: "Bearer s3cret" }), "s3cret")).toBe("ok");
  });

  test("rejects a wrong, truncated or extended token", () => {
    expect(checkServiceToken(req({ authorization: "Bearer wrong" }), "s3cret")).toBe(
      "unauthorized",
    );
    expect(checkServiceToken(req({ authorization: "Bearer s3cre" }), "s3cret")).toBe(
      "unauthorized",
    );
    expect(checkServiceToken(req({ authorization: "Bearer s3crets" }), "s3cret")).toBe(
      "unauthorized",
    );
    expect(checkServiceToken(req(), "s3cret")).toBe("unauthorized");
  });

  test("fails CLOSED when the secret is not configured", () => {
    // The bug this pins: a truthiness check on the binding would have made an
    // unconfigured deployment accept every caller, including one presenting no
    // credential at all.
    expect(checkServiceToken(req({ authorization: "Bearer anything" }), undefined)).toBe(
      "missing-secret",
    );
    expect(checkServiceToken(req(), "")).toBe("missing-secret");
  });
});

describe("serviceTokenRefusal", () => {
  test("401 for a bad token, 503 for an unconfigured server, never cached", async () => {
    const unauthorized = serviceTokenRefusal("unauthorized");
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("Cache-Control")).toBe("no-store");
    expect(await unauthorized.json<{ error: string }>()).toEqual({ error: "Token không hợp lệ." });

    const unconfigured = serviceTokenRefusal("missing-secret");
    expect(unconfigured.status).toBe(503);
    expect(await unconfigured.json<{ error: string }>()).toEqual({
      error: "Tích hợp chưa được cấu hình trên máy chủ.",
    });
  });

  test("carries no CORS headers — this surface is for backends, not browsers", () => {
    const response = serviceTokenRefusal("unauthorized");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
