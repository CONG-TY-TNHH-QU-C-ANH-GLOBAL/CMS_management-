// Lightweight HTML scanning for uploaded landing pages. Not a full parser — a
// position-preserving tag scanner is enough to locate elements, read
// attributes and splice edits without re-serializing (and so without
// reformatting) the page marketing uploaded.
//
// Raw-text elements (script, style, textarea, title) are skipped as one unit,
// so markup inside a JS string never produces phantom tags.

export interface HtmlTag {
  kind: "start" | "end";
  /** Lowercase tag name. */
  name: string;
  /** Offset of "<". */
  start: number;
  /** Offset just past ">". */
  end: number;
  selfClosing: boolean;
}

export interface HtmlAttr {
  name: string;
  value: string | null;
  /** Offsets of the value inside the document (without quotes); -1 when valueless. */
  valueStart: number;
  valueEnd: number;
}

const RAW_TEXT = new Set(["script", "style", "textarea", "title"]);
const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

/** End of a tag starting at `from` (offset just past ">"), honouring quoted attribute values. */
function tagEnd(html: string, from: number): number {
  let quote: string | null = null;
  for (let i = from; i < html.length; i++) {
    const c = html[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === ">") {
      return i + 1;
    }
  }
  return html.length;
}

export function scanTags(html: string): HtmlTag[] {
  const tags: HtmlTag[] = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) break;
    if (html.startsWith("<!--", lt)) {
      const close = html.indexOf("-->", lt + 4);
      i = close < 0 ? html.length : close + 3;
      continue;
    }
    const m = /^<(\/?)([a-zA-Z][\w:-]*)/.exec(html.slice(lt, lt + 64));
    if (!m) {
      i = lt + 1;
      continue;
    }
    const end = tagEnd(html, lt + m[0].length);
    const name = m[2].toLowerCase();
    const isEnd = m[1] === "/";
    tags.push({
      kind: isEnd ? "end" : "start",
      name,
      start: lt,
      end,
      selfClosing: !isEnd && (VOID.has(name) || html[end - 2] === "/"),
    });
    i = end;
    if (!isEnd && RAW_TEXT.has(name)) {
      const close = new RegExp(`</${name}\\s*>`, "ig");
      close.lastIndex = end;
      const found = close.exec(html);
      if (!found) break;
      tags.push({
        kind: "end",
        name,
        start: found.index,
        end: found.index + found[0].length,
        selfClosing: false,
      });
      i = found.index + found[0].length;
    }
  }
  return tags;
}

/** Attributes of the start tag at `tag`, with absolute value offsets. */
export function parseAttrs(html: string, tag: HtmlTag): HtmlAttr[] {
  const attrs: HtmlAttr[] = [];
  const nameEnd = tag.start + 1 + tag.name.length;
  const re = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  const body = html.slice(nameEnd, tag.end - 1);
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const raw = m[2] ?? m[3] ?? m[4];
    if (raw === undefined) {
      attrs.push({ name: m[1].toLowerCase(), value: null, valueStart: -1, valueEnd: -1 });
      continue;
    }
    const quoted = m[2] !== undefined || m[3] !== undefined;
    const valueEndInBody = m.index + m[0].length - (quoted ? 1 : 0);
    const valueStart = nameEnd + valueEndInBody - raw.length;
    attrs.push({
      name: m[1].toLowerCase(),
      value: raw,
      valueStart,
      valueEnd: valueStart + raw.length,
    });
  }
  return attrs;
}

export function attrValue(attrs: HtmlAttr[], name: string): string | null {
  const found = attrs.find((a) => a.name === name);
  if (!found) return null;
  return found.value ?? "";
}

/** Index of the end tag closing the start tag at `index`, or -1. */
export function matchingEnd(tags: HtmlTag[], index: number): number {
  const open = tags[index];
  if (open.kind !== "start" || open.selfClosing) return -1;
  let depth = 0;
  for (let i = index + 1; i < tags.length; i++) {
    const t = tags[i];
    if (t.name !== open.name) continue;
    if (t.kind === "start" && !t.selfClosing) depth++;
    else if (t.kind === "end") {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  times: "×",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1));
      return Number.isFinite(code) && code > 0 && code < 0x110000
        ? String.fromCodePoint(code)
        : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

/** What a reader sees: no comments, no script/style bodies, no tags. */
export function visibleText(html: string): string {
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|template)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ");
  return collapse(decodeEntities(stripped));
}

/**
 * Everything that is CONTENT rather than markup: visible text plus the bodies of scripts and
 * styles (product data and prices often live in a script). Tags and attributes are dropped, so
 * adding an attribute or rewriting a link leaves this unchanged — which is exactly what the
 * format validator relies on.
 */
export function contentProjection(html: string): string {
  const parts: string[] = [];
  const tags = scanTags(html);
  let cursor = 0;
  for (const tag of tags) {
    parts.push(html.slice(cursor, tag.start));
    cursor = tag.end;
  }
  parts.push(html.slice(cursor));
  return collapse(decodeEntities(parts.join(" ").replace(/<!--[\s\S]*?-->/g, " ")));
}

/** Inner text of the element whose start tag is tags[index]. */
export function elementText(html: string, tags: HtmlTag[], index: number): string {
  const end = matchingEnd(tags, index);
  if (end < 0) return "";
  return visibleText(html.slice(tags[index].end, tags[end].start));
}

// ── Splicing ────────────────────────────────────────────────────────────────

export interface Splice {
  start: number;
  end: number;
  text: string;
}

/** Apply non-overlapping splices. Throws on overlap so a bad edit list can never interleave. */
export function applySplices(html: string, splices: Splice[]): string {
  const sorted = [...splices].sort((a, b) => a.start - b.start || a.end - b.end);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start < sorted[i - 1].end) throw new Error("overlapping edits");
  }
  let out = "";
  let cursor = 0;
  for (const s of sorted) {
    out += html.slice(cursor, s.start) + s.text;
    cursor = s.end;
  }
  return out + html.slice(cursor);
}

/** Insert an attribute into the start tag at `tag` (before ">" or "/>"). */
export function insertAttrSplice(html: string, tag: HtmlTag, attr: string): Splice {
  const at = html[tag.end - 2] === "/" ? tag.end - 2 : tag.end - 1;
  return { start: at, end: at, text: ` ${attr}` };
}
