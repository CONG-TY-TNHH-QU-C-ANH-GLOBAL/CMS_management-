// The double-encoding repair on the agent ingest path.
//
// Both live events reached production with the two characters backslash-n where
// their newlines belonged, so the landing page rendered each article as one
// paragraph with "\n\n" and "###" printed as text. Migration 0053 repairs the
// stored rows; decodeEscapedNewlines stops the next submission re-creating it.
//
// The cases that matter here are the ones it must NOT touch. Markdown carries
// backslash-n legitimately inside code fences, and a blanket replace would
// quietly corrupt working content — a worse failure than the bug, because it
// would look fine in the editor and wrong on the site.

import { describe, expect, test } from "bun:test";

import { decodeEscapedNewlines } from "./events.ingest.schema";

/** Built from a char code so the intent survives any future reformatting: this
 *  is one backslash followed by "n", never an escape sequence. */
const BS = String.fromCharCode(92);
const LIT = `${BS}n`;

describe("decodeEscapedNewlines", () => {
  test("repairs a body that has backslash-n and no real newline", () => {
    const input = `## Tiêu đề${LIT}${LIT}Nội dung.${LIT}Dòng 2.`;
    expect(decodeEscapedNewlines(input)).toBe("## Tiêu đề\n\nNội dung.\nDòng 2.");
  });

  test("puts headings back at the start of a line, which is what markdown needs", () => {
    const repaired = decodeEscapedNewlines(
      `## Cảm ơn${LIT}${LIT}### TRICK OR TREND${LIT}Nội dung.`,
    );
    expect(repaired).not.toBeNull();
    expect(/^#{1,6}\s/m.test(repaired as string)).toBe(true);
  });

  test("leaves a body that already has real newlines completely alone", () => {
    const input = "# Tiêu đề\n\nĐoạn văn bình thường.";
    expect(decodeEscapedNewlines(input)).toBe(input);
  });

  test("does not corrupt backslash-n inside a code fence", () => {
    // Real newlines AND a literal backslash-n: the author meant that one.
    const input = ["Ví dụ:", "", "```js", `console.log("a${LIT}b")`, "```", ""].join("\n");
    expect(decodeEscapedNewlines(input)).toBe(input);
  });

  test("leaves prose that merely mentions backslash-n across several lines", () => {
    const input = `Dùng ${LIT} để xuống dòng.\n\nXem thêm ở tài liệu.`;
    expect(decodeEscapedNewlines(input)).toBe(input);
  });

  test("passes through text with neither newlines nor escapes", () => {
    expect(decodeEscapedNewlines("Một dòng duy nhất.")).toBe("Một dòng duy nhất.");
  });

  // Matches what the call site did before this function existed — `input.body_md
  // ?? null` turned a missing body into null and left an empty one empty. The
  // repair must not quietly start collapsing "" to null as well.
  test("maps a missing body to null and leaves an empty one empty", () => {
    expect(decodeEscapedNewlines(null)).toBeNull();
    expect(decodeEscapedNewlines(undefined)).toBeNull();
    expect(decodeEscapedNewlines("")).toBe("");
  });
});
