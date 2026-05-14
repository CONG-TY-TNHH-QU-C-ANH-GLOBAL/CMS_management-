// Unit tests for hash normalization. Pure tests, no I/O — run with bun test.

import { describe, expect, test } from "bun:test";

import { computeSourceHash, normalizeForHash } from "./translations.hash";

describe("normalizeForHash — invariants", () => {
  test("identical strings hash identically", async () => {
    const a = "Hello world";
    expect(normalizeForHash(a)).toBe(normalizeForHash(a));
  });

  test("CRLF and LF produce same normalized form", () => {
    expect(normalizeForHash("a\r\nb")).toBe(normalizeForHash("a\nb"));
  });

  test("trailing whitespace on lines is stripped", () => {
    expect(normalizeForHash("line one    \nline two")).toBe("line one\nline two");
  });

  test("bullet spacing is canonicalised: '-   item' → '- item'", () => {
    expect(normalizeForHash("-   foo")).toBe("- foo");
    expect(normalizeForHash("*    bar")).toBe("* bar");
    expect(normalizeForHash("+ baz")).toBe("+ baz");
  });

  test("preserves emoji and diacritics (content)", () => {
    expect(normalizeForHash("✅ Kho Trung Quốc")).toContain("✅");
    expect(normalizeForHash("Tôi cần làm gì")).toContain("Tôi");
  });

  test("collapses internal multi-space to single space", () => {
    expect(normalizeForHash("hello      world")).toBe("hello world");
  });

  test("preserves line count (does NOT collapse newlines)", () => {
    expect(normalizeForHash("a\nb\nc")).toBe("a\nb\nc");
  });

  test("case-sensitive — different case → different output", () => {
    expect(normalizeForHash("Kho")).not.toBe(normalizeForHash("kho"));
  });
});

describe("computeSourceHash — invariants", () => {
  test("returns 64 lowercase hex chars (sha256)", async () => {
    const h = await computeSourceHash({ a: "foo" });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  test("identical fields → identical hash", async () => {
    const a = await computeSourceHash({ question: "Q?", answer: "A." });
    const b = await computeSourceHash({ question: "Q?", answer: "A." });
    expect(a).toBe(b);
  });

  test("field order does NOT affect hash (canonical sort)", async () => {
    const a = await computeSourceHash({ question: "Q?", answer: "A." });
    const b = await computeSourceHash({ answer: "A.", question: "Q?" });
    expect(a).toBe(b);
  });

  test("cosmetic whitespace edits do NOT change hash", async () => {
    const a = await computeSourceHash({ q: "Hello world" });
    const b = await computeSourceHash({ q: "  Hello   world  " });
    const c = await computeSourceHash({ q: "Hello world\r\n" });
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  test("bullet spacing edit does NOT change hash", async () => {
    const a = await computeSourceHash({ q: "-  item one\n-  item two" });
    const b = await computeSourceHash({ q: "- item one\n- item two" });
    expect(a).toBe(b);
  });

  test("real content edit DOES change hash", async () => {
    const a = await computeSourceHash({ q: "Q one" });
    const b = await computeSourceHash({ q: "Q two" });
    expect(a).not.toBe(b);
  });
});
