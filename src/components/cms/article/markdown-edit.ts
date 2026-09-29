/**
 * Pure text transforms behind the article editor toolbar.
 *
 * Every function takes the textarea's value + selection and returns the next
 * value + the selection to restore, so the toolbar never has to reason about
 * string offsets itself and each transform is testable without a DOM.
 */

export interface Selection {
  value: string;
  start: number;
  end: number;
}

export interface TextEdit {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

/** `**bold**`, `*italic*` — wraps the selection, or inserts a selected placeholder. */
export function wrapInline(
  sel: Selection,
  before: string,
  after: string,
  placeholder: string,
): TextEdit {
  const selected = sel.value.slice(sel.start, sel.end);
  const inner = selected || placeholder;
  const value = sel.value.slice(0, sel.start) + before + inner + after + sel.value.slice(sel.end);
  const selectionStart = sel.start + before.length;
  return { value, selectionStart, selectionEnd: selectionStart + inner.length };
}

/** `[text](url)` around the selection; the placeholder stays selected for typing over. */
export function insertLink(sel: Selection, url: string, placeholder: string): TextEdit {
  return wrapInline(sel, "[", `](${url})`, placeholder);
}

/** The [start, end) range of the whole lines the selection touches. */
function lineRange(sel: Selection): { from: number; to: number } {
  const from = sel.value.lastIndexOf("\n", sel.start - 1) + 1;
  // A selection ending right after a newline does not include the next line.
  const endProbe = sel.end > sel.start && sel.value[sel.end - 1] === "\n" ? sel.end - 1 : sel.end;
  const nl = sel.value.indexOf("\n", endProbe);
  return { from, to: nl === -1 ? sel.value.length : nl };
}

function replaceLines(sel: Selection, map: (lines: string[]) => string[]): TextEdit {
  const { from, to } = lineRange(sel);
  const lines = sel.value.slice(from, to).split("\n");
  const next = map(lines).join("\n");
  return {
    value: sel.value.slice(0, from) + next + sel.value.slice(to),
    selectionStart: from,
    selectionEnd: from + next.length,
  };
}

const HEADING = /^#{1,6}\s+/;

/** `## ` / `### ` on every touched line; applying the same level again removes it. */
export function setHeading(sel: Selection, level: 2 | 3): TextEdit {
  const mark = `${"#".repeat(level)} `;
  return replaceLines(sel, (lines) => {
    const allSame = lines.every((l) => l.startsWith(mark));
    return lines.map((l) => {
      const bare = l.replace(HEADING, "");
      return allSame ? bare : `${mark}${bare}`;
    });
  });
}

const BULLET = /^[-*+]\s+/;
const NUMBERED = /^\d+[.)]\s+/;
const QUOTE = /^>\s?/;

/** `- ` / `1. ` / `> ` prefix on every touched line; toggles off when all lines have it. */
export function toggleLinePrefix(sel: Selection, kind: "bullet" | "numbered" | "quote"): TextEdit {
  const pattern = kind === "bullet" ? BULLET : kind === "numbered" ? NUMBERED : QUOTE;
  return replaceLines(sel, (lines) => {
    const content = lines.filter((l) => l.trim() !== "");
    const allHave = content.length > 0 && content.every((l) => pattern.test(l));
    let n = 0;
    return lines.map((l) => {
      if (l.trim() === "") return l;
      if (allHave) return l.replace(pattern, "");
      // Switching list type replaces the other marker instead of stacking both.
      const bare = l.replace(BULLET, "").replace(NUMBERED, "").replace(QUOTE, "");
      n += 1;
      if (kind === "bullet") return `- ${bare}`;
      if (kind === "numbered") return `${n}. ${bare}`;
      return `> ${bare}`;
    });
  });
}

/**
 * A block that must stand in its own paragraph — an image, or a video link the
 * website turns into a player. Inserted at the cursor (after the selection)
 * with blank lines around it so Markdown never glues it onto the text before.
 */
export function insertBlock(sel: Selection, block: string): TextEdit {
  const before = sel.value.slice(0, sel.end);
  const after = sel.value.slice(sel.end);
  const lead =
    before === "" ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const trail =
    after === "" ? "\n" : after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  const value = before + lead + block + trail + after;
  const caret = before.length + lead.length + block.length;
  return { value, selectionStart: caret, selectionEnd: caret };
}

/** Markdown image syntax; brackets in alt text would end the alt early. */
export function imageMarkdown(url: string, alt: string): string {
  const safeAlt = alt.replace(/[[\]]/g, "").trim();
  return `![${safeAlt}](${url})`;
}
