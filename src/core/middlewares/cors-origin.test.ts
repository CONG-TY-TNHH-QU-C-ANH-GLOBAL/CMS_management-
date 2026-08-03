import { describe, expect, test } from "bun:test";

import {
  isAllowedMutationOrigin,
  isLocalhostOrigin,
  normalizeOrigin,
  parseOriginAllowList,
} from "./cors-origin";

describe("isLocalhostOrigin", () => {
  test("accepts loopback preview origins with a port", () => {
    expect(isLocalhostOrigin("http://127.0.0.1:4173")).toBe(true);
    expect(isLocalhostOrigin("http://localhost:5173")).toBe(true);
    expect(isLocalhostOrigin("https://localhost:8080")).toBe(true);
    expect(isLocalhostOrigin("http://[::1]:3000")).toBe(true);
    expect(isLocalhostOrigin("http://localhost")).toBe(true);
  });

  test("rejects spoof and production origins", () => {
    expect(isLocalhostOrigin("http://localhost.evil.com")).toBe(false);
    expect(isLocalhostOrigin("http://127.0.0.1.evil.com")).toBe(false);
    expect(isLocalhostOrigin("https://thgfulfill.com")).toBe(false);
    expect(isLocalhostOrigin("http://evil.com?localhost")).toBe(false);
    expect(isLocalhostOrigin(null)).toBe(false);
    expect(isLocalhostOrigin("")).toBe(false);
  });
});

// ── CMS-P1 public browser mutation boundary ─────────────────────────────────

/** The production allow-list, verbatim from wrangler.jsonc `vars.CORS_ORIGIN`. */
const PROD_ALLOW_LIST = "https://thgfulfill.com,https://www.thgfulfill.com";
/** Shape of a real Vercel Preview host for the migration branch. */
const PREVIEW_ORIGIN = "https://thg-landing-git-migration-next-main-thg.vercel.app";

const PROD = { allowLoopback: false };
const DEV = { allowLoopback: true };

describe("normalizeOrigin", () => {
  test("canonicalizes case and default ports, and drops path/trailing slash", () => {
    expect(normalizeOrigin("https://thgfulfill.com")).toBe("https://thgfulfill.com");
    expect(normalizeOrigin("https://THGFULFILL.com")).toBe("https://thgfulfill.com");
    expect(normalizeOrigin("https://thgfulfill.com/")).toBe("https://thgfulfill.com");
    expect(normalizeOrigin("https://thgfulfill.com:443")).toBe("https://thgfulfill.com");
    expect(normalizeOrigin("https://thgfulfill.com/some/path?q=1")).toBe("https://thgfulfill.com");
  });

  test("keeps a non-default port distinct — a port is part of the origin", () => {
    expect(normalizeOrigin("https://thgfulfill.com:8443")).toBe("https://thgfulfill.com:8443");
    expect(normalizeOrigin("http://thgfulfill.com")).toBe("http://thgfulfill.com");
  });

  test("returns null for absent, malformed and opaque origins", () => {
    expect(normalizeOrigin(null)).toBeNull();
    expect(normalizeOrigin(undefined)).toBeNull();
    expect(normalizeOrigin("")).toBeNull();
    expect(normalizeOrigin("   ")).toBeNull();
    expect(normalizeOrigin("null")).toBeNull(); // the literal opaque-origin serialization
    expect(normalizeOrigin("thgfulfill.com")).toBeNull(); // bare host, not an origin
    expect(normalizeOrigin("https://")).toBeNull();
    expect(normalizeOrigin("://thgfulfill.com")).toBeNull();
    expect(normalizeOrigin("data:text/html,<script>")).toBeNull();
  });
});

describe("parseOriginAllowList", () => {
  test("parses the production value into canonical origins", () => {
    expect(parseOriginAllowList(PROD_ALLOW_LIST)).toEqual([
      "https://thgfulfill.com",
      "https://www.thgfulfill.com",
    ]);
  });

  test("tolerates whitespace and duplicates without widening", () => {
    expect(parseOriginAllowList(" https://thgfulfill.com , https://thgfulfill.com/ ")).toEqual([
      "https://thgfulfill.com",
    ]);
  });

  test("drops unparseable entries rather than matching them loosely", () => {
    expect(parseOriginAllowList("thgfulfill.com,https://thgfulfill.com,,*")).toEqual([
      "https://thgfulfill.com",
    ]);
  });

  test("empty or absent configuration yields an empty list", () => {
    expect(parseOriginAllowList(undefined)).toEqual([]);
    expect(parseOriginAllowList(null)).toEqual([]);
    expect(parseOriginAllowList("")).toEqual([]);
    expect(parseOriginAllowList(" , , ")).toEqual([]);
  });
});

describe("isAllowedMutationOrigin", () => {
  const allow = parseOriginAllowList(PROD_ALLOW_LIST);

  test("allows the configured production landing origins", () => {
    expect(isAllowedMutationOrigin("https://thgfulfill.com", allow, PROD)).toBe(true);
    expect(isAllowedMutationOrigin("https://www.thgfulfill.com", allow, PROD)).toBe(true);
    // Same origin, non-canonical spelling from a real browser is still exact after normalization.
    expect(isAllowedMutationOrigin("https://THGFULFILL.com", allow, PROD)).toBe(true);
  });

  test("rejects a representative Vercel Preview origin", () => {
    expect(isAllowedMutationOrigin(PREVIEW_ORIGIN, allow, PROD)).toBe(false);
    expect(isAllowedMutationOrigin(PREVIEW_ORIGIN, allow, DEV)).toBe(false);
    expect(isAllowedMutationOrigin("https://thgfulfill.vercel.app", allow, PROD)).toBe(false);
  });

  test("rejects hostile lookalike hostnames — matching is exact, never substring or suffix", () => {
    expect(isAllowedMutationOrigin("https://thgfulfill.com.evil.example", allow, PROD)).toBe(false);
    expect(isAllowedMutationOrigin("https://evil-thgfulfill.com", allow, PROD)).toBe(false);
    expect(isAllowedMutationOrigin("https://evil.example/thgfulfill.com", allow, PROD)).toBe(false);
    expect(isAllowedMutationOrigin("https://sub.thgfulfill.com", allow, PROD)).toBe(false);
    expect(isAllowedMutationOrigin("https://thgfulfill.co", allow, PROD)).toBe(false);
    expect(isAllowedMutationOrigin("https://xthgfulfill.com", allow, PROD)).toBe(false);
  });

  test("rejects a right scheme/host on an unexpected port, and a downgraded scheme", () => {
    expect(isAllowedMutationOrigin("https://thgfulfill.com:8443", allow, PROD)).toBe(false);
    expect(isAllowedMutationOrigin("https://thgfulfill.com:3000", allow, PROD)).toBe(false);
    expect(isAllowedMutationOrigin("http://thgfulfill.com", allow, PROD)).toBe(false);
  });

  test("rejects missing, malformed and opaque origins", () => {
    expect(isAllowedMutationOrigin(null, allow, PROD)).toBe(false);
    expect(isAllowedMutationOrigin(undefined, allow, PROD)).toBe(false);
    expect(isAllowedMutationOrigin("", allow, PROD)).toBe(false);
    expect(isAllowedMutationOrigin("null", allow, PROD)).toBe(false);
    expect(isAllowedMutationOrigin("thgfulfill.com", allow, PROD)).toBe(false);
    // Missing Origin is rejected in DEV too — the loopback allowance needs a real loopback value.
    expect(isAllowedMutationOrigin(null, allow, DEV)).toBe(false);
  });

  test("loopback is allowed only outside production", () => {
    for (const origin of ["http://localhost:5173", "http://127.0.0.1:8787", "http://[::1]:3000"]) {
      expect(isAllowedMutationOrigin(origin, allow, DEV)).toBe(true);
      expect(isAllowedMutationOrigin(origin, allow, PROD)).toBe(false);
    }
    // The anchored loopback predicate still refuses a spoof, in either mode.
    expect(isAllowedMutationOrigin("http://localhost.evil.com", allow, DEV)).toBe(false);
  });

  test("an empty production allow-list fails closed for every origin", () => {
    expect(isAllowedMutationOrigin("https://thgfulfill.com", [], PROD)).toBe(false);
    expect(isAllowedMutationOrigin(PREVIEW_ORIGIN, [], PROD)).toBe(false);
    expect(isAllowedMutationOrigin(null, [], PROD)).toBe(false);
    // Same for a configured value that parses to nothing usable.
    expect(isAllowedMutationOrigin("https://thgfulfill.com", parseOriginAllowList("*"), PROD)).toBe(
      false,
    );
  });
});
