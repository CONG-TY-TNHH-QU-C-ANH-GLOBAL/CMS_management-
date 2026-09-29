import { describe, expect, test } from "bun:test";

import {
  imageMarkdown,
  insertBlock,
  insertLink,
  setHeading,
  toggleLinePrefix,
  wrapInline,
} from "./markdown-edit";

/** `|` marks the caret, `[` `]` mark a selection — keeps the cases readable. */
function sel(marked: string) {
  if (marked.includes("[")) {
    const start = marked.indexOf("[");
    const end = marked.indexOf("]") - 1;
    return { value: marked.replace("[", "").replace("]", ""), start, end };
  }
  const at = marked.indexOf("|");
  return { value: marked.replace("|", ""), start: at, end: at };
}

describe("wrapInline", () => {
  test("wraps the selection and keeps it selected", () => {
    const r = wrapInline(sel("Giá [kho Mỹ] mới"), "**", "**", "chữ đậm");
    expect(r.value).toBe("Giá **kho Mỹ** mới");
    expect(r.value.slice(r.selectionStart, r.selectionEnd)).toBe("kho Mỹ");
  });

  test("inserts a selected placeholder when nothing is selected", () => {
    const r = wrapInline(sel("A |B"), "*", "*", "nghiêng");
    expect(r.value).toBe("A *nghiêng*B");
    expect(r.value.slice(r.selectionStart, r.selectionEnd)).toBe("nghiêng");
  });
});

test("insertLink puts the url after the selected text", () => {
  const r = insertLink(sel("Xem [slide]"), "https://docs.google.com/x", "chữ");
  expect(r.value).toBe("Xem [slide](https://docs.google.com/x)");
});

describe("setHeading", () => {
  test("adds the mark to every touched line", () => {
    expect(setHeading(sel("[Một\nHai]"), 2).value).toBe("## Một\n## Hai");
  });

  test("replaces a different heading level instead of stacking", () => {
    expect(setHeading(sel("### Tiêu|đề"), 2).value).toBe("## Tiêuđề");
  });

  test("applying the same level again removes it", () => {
    expect(setHeading(sel("## Tiêu|đề"), 2).value).toBe("Tiêuđề");
  });

  test("only touches the caret's line", () => {
    expect(setHeading(sel("a\nb|\nc"), 3).value).toBe("a\n### b\nc");
  });
});

describe("toggleLinePrefix", () => {
  test("bullets each non-empty line and keeps blank lines", () => {
    expect(toggleLinePrefix(sel("[a\n\nb]"), "bullet").value).toBe("- a\n\n- b");
  });

  test("numbers lines in order", () => {
    expect(toggleLinePrefix(sel("[a\nb\nc]"), "numbered").value).toBe("1. a\n2. b\n3. c");
  });

  test("switches bullet to numbered without stacking markers", () => {
    expect(toggleLinePrefix(sel("[- a\n- b]"), "numbered").value).toBe("1. a\n2. b");
  });

  test("toggles off when every line already has the prefix", () => {
    expect(toggleLinePrefix(sel("[> a\n> b]"), "quote").value).toBe("a\nb");
  });

  test("a selection ending at a newline does not grab the next line", () => {
    expect(toggleLinePrefix(sel("[a\n]b"), "bullet").value).toBe("- a\nb");
  });
});

describe("insertBlock", () => {
  test("separates the block from surrounding text with blank lines", () => {
    const r = insertBlock(sel("Đoạn một|\nĐoạn hai"), "https://youtu.be/q7NiFssAaRE");
    expect(r.value).toBe("Đoạn một\n\nhttps://youtu.be/q7NiFssAaRE\n\nĐoạn hai");
  });

  test("does not add extra blank lines where they already exist", () => {
    const r = insertBlock(sel("A\n\n|\n\nB"), "X");
    expect(r.value).toBe("A\n\nX\n\nB");
  });

  test("into an empty body", () => {
    expect(insertBlock(sel("|"), "X").value).toBe("X\n");
  });
});

test("imageMarkdown strips brackets from the alt text", () => {
  expect(imageMarkdown("https://cms.thgfulfill.com/a.jpg", "Kho [Mỹ]")).toBe(
    "![Kho Mỹ](https://cms.thgfulfill.com/a.jpg)",
  );
});
