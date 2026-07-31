import { test, expect, describe } from "bun:test";

import { resolveLoginError, ERROR_MESSAGES, GENERIC_LOGIN_ERROR } from "./login.errors";

describe("resolveLoginError — bounded login error contract", () => {
  test("oauth_not_configured resolves to its fixed localized message", () => {
    expect(resolveLoginError("oauth_not_configured")).toBe(ERROR_MESSAGES.oauth_not_configured);
  });

  test("an existing allowlisted error is unchanged", () => {
    expect(resolveLoginError("token_exchange_failed")).toBe(ERROR_MESSAGES.token_exchange_failed);
  });

  test("an unknown code resolves ONLY to the generic fallback (never the raw code)", () => {
    const resolved = resolveLoginError("totally_unknown_code");
    expect(resolved).toBe(GENERIC_LOGIN_ERROR);
    expect(resolved).not.toContain("totally_unknown_code");
  });

  test("an HTML-like / misleading value is not reflected", () => {
    const evil = "<img src=x onerror=alert(1)>";
    const resolved = resolveLoginError(evil);
    expect(resolved).toBe(GENERIC_LOGIN_ERROR);
    expect(resolved).not.toContain("<img");
    expect(resolved).not.toContain(evil);
  });

  test("a very long value is not reflected", () => {
    const long = "x".repeat(5000);
    const resolved = resolveLoginError(long);
    expect(resolved).toBe(GENERIC_LOGIN_ERROR);
    expect(resolved!.length).toBeLessThan(200);
  });

  test("a missing error keeps the normal login state (no message)", () => {
    expect(resolveLoginError(undefined)).toBeNull();
    expect(resolveLoginError("")).toBeNull();
  });

  test("inherited object keys never resolve to a message (Object.hasOwn, not `in`)", () => {
    for (const proto of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      expect(resolveLoginError(proto)).toBe(GENERIC_LOGIN_ERROR);
    }
  });
});
