import { describe, expect, test } from "bun:test";

import {
  hasAllExpectedFields,
  passesStructuralChecks,
  tryParseJson,
} from "./translations.structural";

describe("tryParseJson — AI output recovery", () => {
  test("plain JSON parses", () => {
    expect(tryParseJson('{"en":"hello"}')).toEqual({ en: "hello" });
  });

  test("markdown-fenced JSON parses", () => {
    const s = '```json\n{"en":"hello"}\n```';
    expect(tryParseJson(s)).toEqual({ en: "hello" });
  });

  test("plain-fence JSON parses", () => {
    const s = '```\n{"en":"hello"}\n```';
    expect(tryParseJson(s)).toEqual({ en: "hello" });
  });

  test("prose-prefixed JSON parses", () => {
    const s = 'Here is the translation:\n{"en":"hello"}';
    expect(tryParseJson(s)).toEqual({ en: "hello" });
  });

  test("prose-suffixed JSON parses", () => {
    const s = '{"en":"hello"}\nLet me know if you need anything else.';
    expect(tryParseJson(s)).toEqual({ en: "hello" });
  });

  test("nested object parses", () => {
    const s = '{"en":{"question":"Q?","answer":"A."},"zh":{"question":"问","answer":"答"}}';
    const parsed = tryParseJson(s);
    expect(parsed).toBeTruthy();
    expect((parsed?.en as Record<string, string>)?.question).toBe("Q?");
  });

  test("malformed JSON returns null", () => {
    expect(tryParseJson("not json at all")).toBeNull();
    expect(tryParseJson("{ invalid }")).toBeNull();
  });

  test("array at top level returns null (we need object)", () => {
    expect(tryParseJson("[1, 2, 3]")).toBeNull();
  });

  test("empty input returns null", () => {
    expect(tryParseJson("")).toBeNull();
  });
});

describe("hasAllExpectedFields", () => {
  test("all keys present + strings → true", () => {
    const ok = hasAllExpectedFields(
      { question: "Q", answer: "A" },
      { question: "Vi Q", answer: "Vi A" },
    );
    expect(ok).toBe(true);
  });

  test("missing key → false", () => {
    const ok = hasAllExpectedFields({ question: "Q" }, { question: "Vi Q", answer: "Vi A" });
    expect(ok).toBe(false);
  });

  test("non-string value → false", () => {
    const ok = hasAllExpectedFields(
      { question: "Q", answer: 42 },
      { question: "Vi Q", answer: "Vi A" },
    );
    expect(ok).toBe(false);
  });

  test("null → false", () => {
    expect(hasAllExpectedFields(null, { q: "v" })).toBe(false);
  });

  test("array → false", () => {
    expect(hasAllExpectedFields(["a", "b"], { q: "v" })).toBe(false);
  });
});

describe("passesStructuralChecks", () => {
  test("identical structure passes", () => {
    const src = { q: "Q one", a: "A one" };
    const dst = { q: "Q one", a: "A one" };
    expect(passesStructuralChecks(dst, src)).toBe(true);
  });

  test("bullet count match passes", () => {
    const src = { a: "- one\n- two\n- three" };
    const dst = { a: "- alpha\n- beta\n- gamma" };
    expect(passesStructuralChecks(dst, src)).toBe(true);
  });

  test("bullet count mismatch fails (AI dropped a bullet)", () => {
    const src = { a: "- one\n- two\n- three" };
    const dst = { a: "- alpha\n- beta" };
    expect(passesStructuralChecks(dst, src)).toBe(false);
  });

  test("heading count mismatch fails", () => {
    const src = { a: "# Title\nbody" };
    const dst = { a: "body" };
    expect(passesStructuralChecks(dst, src)).toBe(false);
  });

  test("line count within ±20% passes", () => {
    const src = { a: "line1\nline2\nline3\nline4\nline5" };
    const dst = { a: "l1\nl2\nl3\nl4\nl5\nl6" }; // 5 → 6 = 20% diff
    expect(passesStructuralChecks(dst, src)).toBe(true);
  });

  test("line count off by >20% fails", () => {
    const src = { a: "line1\nline2\nline3\nline4\nline5" };
    const dst = { a: "one line" }; // 5 → 1 = 80% diff
    expect(passesStructuralChecks(dst, src)).toBe(false);
  });

  test("empty target for non-empty source fails", () => {
    expect(passesStructuralChecks({ q: "" }, { q: "real content" })).toBe(false);
  });

  test("missing field fails (not a string)", () => {
    expect(passesStructuralChecks({} as Record<string, string>, { q: "v" })).toBe(false);
  });

  test("mixed bullet styles count together (-, *, +)", () => {
    const src = { a: "- one\n* two\n+ three" };
    const dst = { a: "- alpha\n* beta\n+ gamma" };
    expect(passesStructuralChecks(dst, src)).toBe(true);
  });
});
