import { describe, expect, test } from "bun:test";

import {
  OAUTH_REDIRECT_COOKIE,
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  buildCookie,
  cookieName,
  readCookie,
} from "./auth.cookies";

const attrs = (setCookie: string) => setCookie.split("; ").slice(1);

describe("cookie names and attributes", () => {
  test("production uses __Host- names: Secure, Path=/, no Domain", () => {
    for (const base of [SESSION_COOKIE, OAUTH_STATE_COOKIE, OAUTH_REDIRECT_COOKIE]) {
      const cookie = buildCookie(base, "v", 600, true);
      expect(cookie.startsWith(`__Host-${base}=v; `)).toBe(true);
      expect(attrs(cookie)).toEqual([
        "Path=/",
        "HttpOnly",
        "SameSite=Lax",
        "Max-Age=600",
        "Secure",
      ]);
      expect(cookie.toLowerCase()).not.toContain("domain=");
    }
    expect(cookieName("thg_sid", true)).toBe("__Host-thg_sid");
  });

  test("local dev keeps the plain names without Secure", () => {
    const cookie = buildCookie(SESSION_COOKIE, "v", 60, false);
    expect(cookie).toBe("thg_sid=v; Path=/; HttpOnly; SameSite=Lax; Max-Age=60");
  });

  test("a clear cookie expires the same (prefixed) name", () => {
    expect(buildCookie(SESSION_COOKIE, "", 0, true)).toBe(
      "__Host-thg_sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure",
    );
    expect(buildCookie(SESSION_COOKIE, "", -5, false)).toContain("Max-Age=0");
  });
});

describe("reading the session cookie", () => {
  test("production ignores an unprefixed thg_sid tossed in from a sibling subdomain", () => {
    // What the browser sends after a script on lp.thgfulfill.com wrote
    // `thg_sid=attacker; Domain=thgfulfill.com; Path=/admin`: the more specific path first.
    const header = "thg_sid=attacker; other=1; __Host-thg_sid=real";
    expect(readCookie(header, SESSION_COOKIE, true)).toBe("real");
    expect(readCookie("thg_sid=attacker", SESSION_COOKIE, true)).toBe("");
  });

  test("production does not fall back to the old unprefixed name (clean cutover)", () => {
    expect(readCookie("thg_sid=old-session", SESSION_COOKIE, true)).toBe("");
    expect(readCookie("thg_oauth_state=s", OAUTH_STATE_COOKIE, true)).toBe("");
  });

  test("dev reads the plain name and only an exact match", () => {
    expect(readCookie("xthg_sid=no; thg_sid=yes", SESSION_COOKIE, false)).toBe("yes");
    expect(readCookie("__Host-thg_sid=prod-only", SESSION_COOKIE, false)).toBe("");
    expect(readCookie(null, SESSION_COOKIE, false)).toBe("");
  });
});
