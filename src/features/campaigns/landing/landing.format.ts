// AI format step: the preset prompt (format.prompt.md) may only
//   1. swap the page's own top header/nav for the standard TH Group header,
//   2. mark consult buttons with data-consult,
//   3. fix the old brand "THG Fulfill" where it names the company,
//   4. make thgfulfill.com links absolute https.
//
// The model never rewrites the file. Code finds every place an edit COULD
// happen and gives each an id; the model answers with an edit list naming ids;
// code applies them (the header markup itself comes from landing.header.ts).
// The result is then validated — same content outside the header except the
// brand fixes, same tag structure, bounded size — and any failure falls back
// to the deterministic normalization, with the reason in the report.

import { z } from "zod";

import type { PromptMessage } from "@/features/translations/translations.prompt";

import { oldBrandMatches } from "./landing.checks";
import {
  applySplices,
  attrValue,
  contentProjection,
  elementText,
  insertAttrSplice,
  matchingEnd,
  parseAttrs,
  scanTags,
  visibleText,
  type HtmlTag,
  type Splice,
} from "./landing.html";
import { HEADER_END, HEADER_START, SITE_ORIGIN, renderStandardHeader } from "./landing.header";
import type { LandingLang } from "./landing.normalize";
import type { DiffSummary, FormatReport } from "./landing.types";

export type { PromptMessage };

/** The AI boundary: one JSON-mode chat call. `parsed` is null when the call or parsing failed. */
export type JsonAiCall = (
  messages: PromptMessage[],
) => Promise<{ parsed: Record<string, unknown> | null; error: string | null }>;

// ── Candidates ──────────────────────────────────────────────────────────────

interface Range {
  start: number;
  end: number;
}

export interface HeaderCandidate extends Range {
  id: string;
  tag: string;
  text: string;
  markup: string;
}

export interface ConsultCandidate {
  id: string;
  tag: HtmlTag;
  text: string;
  href: string | null;
}

export interface BrandCandidate extends Range {
  id: string;
  original: string;
  context: string;
}

export interface LinkCandidate extends Range {
  id: string;
  href: string;
  text: string;
}

export interface FormatCandidates {
  header: HeaderCandidate[];
  consult: ConsultCandidate[];
  brand: BrandCandidate[];
  links: LinkCandidate[];
}

const CONSULT_TEXT =
  /tư vấn|báo giá|liên hệ|đăng ký|nhận ưu đãi|consult|contact|get started|get a quote|quote|咨询|联系/i;
const HEADERISH =
  /(?:^|[\s_-])(?:site-?header|header|navbar|nav-?bar|topnav|top-?bar|menu-?bar)(?:$|[\s_-])/i;
const SCHEMELESS_THG = /^(?:www\.)?thgfulfill\.com(?:[/?#]|$)/i;

/** Where the page's own header can be: from <body> to the first <main>, <section> or <h1>. */
function topRegionEnd(tags: HtmlTag[], html: string): number {
  const bodyIndex = tags.findIndex((t) => t.kind === "start" && t.name === "body");
  const firstContent = tags.find(
    (t, i) => i > bodyIndex && t.kind === "start" && ["main", "section", "h1"].includes(t.name),
  );
  return firstContent ? firstContent.start : Math.floor(html.length * 0.4);
}

function headerCandidates(html: string, tags: HtmlTag[]): HeaderCandidate[] {
  const limit = topRegionEnd(tags, html);
  const out: HeaderCandidate[] = [];
  let coveredUntil = -1;
  tags.forEach((tag, i) => {
    if (tag.kind !== "start" || tag.start >= limit || tag.start < coveredUntil) return;
    const attrs = parseAttrs(html, tag);
    const label = `${attrValue(attrs, "class") ?? ""} ${attrValue(attrs, "id") ?? ""}`;
    const isHeader =
      tag.name === "header" || tag.name === "nav" || (tag.name === "div" && HEADERISH.test(label));
    if (!isHeader) return;
    const close = matchingEnd(tags, i);
    if (close < 0) return;
    const range = { start: tag.start, end: tags[close].end };
    coveredUntil = range.end;
    out.push({
      id: `h${out.length + 1}`,
      tag: tag.name,
      ...range,
      text: visibleText(html.slice(range.start, range.end)).slice(0, 400),
      markup: html.slice(range.start, Math.min(range.end, range.start + 1500)),
    });
  });
  return out.slice(0, 6);
}

function consultCandidates(html: string, tags: HtmlTag[]): ConsultCandidate[] {
  const out: ConsultCandidate[] = [];
  tags.forEach((tag, i) => {
    if (tag.kind !== "start" || (tag.name !== "a" && tag.name !== "button")) return;
    const attrs = parseAttrs(html, tag);
    if (attrValue(attrs, "data-consult") !== null) return;
    const href = attrValue(attrs, "href");
    const text = elementText(html, tags, i).slice(0, 120);
    const label = `${text} ${attrValue(attrs, "aria-label") ?? ""} ${attrValue(attrs, "title") ?? ""}`;
    if (!CONSULT_TEXT.test(label) && !href?.toLowerCase().startsWith("mailto:")) return;
    out.push({ id: `c${out.length + 1}`, tag, text, href });
  });
  return out.slice(0, 200);
}

function brandCandidates(html: string): BrandCandidate[] {
  return oldBrandMatches(html)
    .slice(0, 200)
    .map((m, i) => ({
      id: `b${i + 1}`,
      start: m.start,
      end: m.end,
      original: m.text,
      context: html.slice(Math.max(0, m.start - 60), m.end + 60).replace(/\s+/g, " "),
    }));
}

function linkCandidates(html: string, tags: HtmlTag[]): LinkCandidate[] {
  const out: LinkCandidate[] = [];
  tags.forEach((tag, i) => {
    if (tag.kind !== "start" || tag.name !== "a") return;
    const href = parseAttrs(html, tag).find((a) => a.name === "href");
    const value = href?.value?.trim();
    if (!href || !value) return;
    const rootRelative = /^\/(?!\/)/.test(value) && !value.startsWith("/_thg/");
    if (!rootRelative && !SCHEMELESS_THG.test(value)) return;
    out.push({
      id: `l${out.length + 1}`,
      start: href.valueStart,
      end: href.valueEnd,
      href: value,
      text: elementText(html, tags, i).slice(0, 80),
    });
  });
  return out.slice(0, 200);
}

export function findFormatCandidates(html: string): FormatCandidates {
  const tags = scanTags(html);
  return {
    header: headerCandidates(html, tags),
    consult: consultCandidates(html, tags),
    brand: brandCandidates(html),
    links: linkCandidates(html, tags),
  };
}

// ── Prompt ──────────────────────────────────────────────────────────────────

export function buildFormatMessages(
  prompt: string,
  candidates: FormatCandidates,
  lang: LandingLang,
): PromptMessage[] {
  const payload = {
    page_language: lang,
    header_candidates: candidates.header.map(({ id, tag, text, markup }) => ({
      id,
      tag,
      text,
      markup,
    })),
    consult_candidates: candidates.consult.map(({ id, text, href }) => ({ id, text, href })),
    brand_occurrences: candidates.brand.map(({ id, original, context }) => ({
      id,
      original,
      context,
    })),
    link_candidates: candidates.links.map(({ id, href, text }) => ({ id, href, text })),
  };
  return [
    { role: "system", content: prompt },
    { role: "user", content: JSON.stringify(payload) },
  ];
}

// ── Edit list ───────────────────────────────────────────────────────────────

const editSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("replace_header"), target: z.string() }),
  z.object({ op: z.literal("mark_consult"), target: z.string() }),
  z.object({
    op: z.literal("fix_brand"),
    target: z.string(),
    replacement: z.enum(["TH Group", "TH Group Fulfill"]),
  }),
  z.object({ op: z.literal("absolutize_link"), target: z.string() }),
]);
const responseSchema = z.object({
  edits: z.array(editSchema).max(800),
  notes: z.string().max(2000).optional(),
});
export type FormatEdit = z.infer<typeof editSchema>;

export class FormatRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormatRejected";
  }
}

/** Keep the original's casing: "THG FULFILL" → "TH GROUP". */
function matchCase(original: string, replacement: string): string {
  return original === original.toUpperCase() ? replacement.toUpperCase() : replacement;
}

function absolutize(href: string): string {
  return href.startsWith("/") ? `${SITE_ORIGIN}${href}` : `https://${href}`;
}

const inside = (range: Range | null, at: number) =>
  range !== null && at >= range.start && at < range.end;

interface Planned {
  splices: Splice[];
  brandSplices: Splice[];
  header: HeaderCandidate | null;
  applied: string[];
  diff: Omit<DiffSummary, "bytesBefore" | "bytesAfter">;
}

function planEdits(
  html: string,
  candidates: FormatCandidates,
  edits: FormatEdit[],
  lang: LandingLang,
): Planned {
  const byId = <T extends { id: string }>(list: T[], id: string, kind: string): T => {
    const found = list.find((c) => c.id === id);
    if (!found) throw new FormatRejected(`AI trả về ${kind} không tồn tại: ${id}`);
    return found;
  };
  const headerEdits = edits.filter((e) => e.op === "replace_header");
  if (headerEdits.length > 1) throw new FormatRejected("AI chọn nhiều hơn một header để thay.");
  const header = headerEdits[0] ? byId(candidates.header, headerEdits[0].target, "header") : null;
  if (header) {
    const pageText = visibleText(html).length;
    if (header.text.length > 600 || header.text.length > pageText * 0.15) {
      throw new FormatRejected(
        `Vùng header AI chọn (${header.id}) chứa quá nhiều nội dung — có thể không phải thanh điều hướng.`,
      );
    }
  }

  const splices: Splice[] = [];
  const brandSplices: Splice[] = [];
  const applied: string[] = [];
  const done = new Set<string>();
  const diff = { headerReplaced: false, consultMarked: 0, brandFixed: 0, linksFixed: 0 };
  if (header) {
    splices.push({ start: header.start, end: header.end, text: renderStandardHeader(lang) });
    applied.push(`Thay header/nav của trang (${header.tag}) bằng header chuẩn TH Group.`);
    diff.headerReplaced = true;
  }
  const headerRange = header ? { start: header.start, end: header.end } : null;

  for (const edit of edits) {
    if (edit.op === "replace_header" || done.has(edit.target)) continue;
    done.add(edit.target);
    if (edit.op === "mark_consult") {
      const c = byId(candidates.consult, edit.target, "nút tư vấn");
      if (inside(headerRange, c.tag.start)) continue;
      splices.push(insertAttrSplice(html, c.tag, "data-consult"));
      diff.consultMarked++;
    } else if (edit.op === "fix_brand") {
      const b = byId(candidates.brand, edit.target, "vị trí thương hiệu");
      if (inside(headerRange, b.start)) continue;
      const splice = { start: b.start, end: b.end, text: matchCase(b.original, edit.replacement) };
      splices.push(splice);
      brandSplices.push(splice);
      diff.brandFixed++;
    } else {
      const l = byId(candidates.links, edit.target, "link");
      if (inside(headerRange, l.start)) continue;
      splices.push({ start: l.start, end: l.end, text: absolutize(l.href) });
      diff.linksFixed++;
    }
  }
  if (diff.consultMarked) applied.push(`Gắn data-consult cho ${diff.consultMarked} nút tư vấn.`);
  if (diff.brandFixed) applied.push(`Sửa ${diff.brandFixed} chỗ "THG Fulfill" → "TH Group".`);
  if (diff.linksFixed) applied.push(`Chuyển ${diff.linksFixed} link sang https://thgfulfill.com.`);
  return { splices, brandSplices, header, applied, diff };
}

/** Remove the standard header block (markers included). */
function withoutStandardHeader(html: string): string {
  const start = html.indexOf(HEADER_START);
  const end = html.indexOf(HEADER_END);
  if (start < 0 || end < start) return html;
  return html.slice(0, start) + html.slice(end + HEADER_END.length);
}

const tagSequence = (html: string) =>
  scanTags(html)
    .map((t) => `${t.kind === "end" ? "/" : ""}${t.name}`)
    .join(",");

/** The post-conditions an AI-formatted page must meet. Throws FormatRejected. */
export function validateFormatted(before: string, after: string, planned: Planned): void {
  if (after.length > before.length + 64 * 1024 || after.length > 10 * 1024 * 1024) {
    throw new FormatRejected("Kết quả định dạng vượt giới hạn kích thước.");
  }
  // The expected page: the original with ONLY the brand fixes applied and the header removed.
  const removeHeader: Splice[] = planned.header
    ? [{ start: planned.header.start, end: planned.header.end, text: "" }]
    : [];
  const expected = applySplices(before, [...planned.brandSplices, ...removeHeader]);
  const actual = withoutStandardHeader(after);
  if (contentProjection(expected) !== contentProjection(actual)) {
    throw new FormatRejected("Nội dung ngoài header bị thay đổi — không áp dụng bản AI.");
  }
  if (tagSequence(expected) !== tagSequence(actual)) {
    throw new FormatRejected("Cấu trúc HTML bị thay đổi ngoài header — không áp dụng bản AI.");
  }
}

/** Apply a parsed edit list. Throws FormatRejected when it is invalid or breaks validation. */
export function applyFormatEdits(
  html: string,
  candidates: FormatCandidates,
  edits: FormatEdit[],
  lang: LandingLang,
): { html: string; applied: string[]; diff: DiffSummary } {
  const planned = planEdits(html, candidates, edits, lang);
  let out: string;
  try {
    out = applySplices(html, planned.splices);
  } catch {
    throw new FormatRejected("Các chỉnh sửa của AI chồng lên nhau.");
  }
  validateFormatted(html, out, planned);
  return {
    html: out,
    applied: planned.applied,
    diff: { bytesBefore: html.length, bytesAfter: out.length, ...planned.diff },
  };
}

const emptyDiff = (html: string): DiffSummary => ({
  bytesBefore: html.length,
  bytesAfter: html.length,
  headerReplaced: false,
  consultMarked: 0,
  brandFixed: 0,
  linksFixed: 0,
});

/**
 * Run the AI format step on the deterministic output. Never throws: every failure path returns
 * the input unchanged with mode "deterministic" and the reason in `note`.
 */
export async function runFormatStep(input: {
  html: string;
  lang: LandingLang;
  prompt: string;
  ai: JsonAiCall | null;
  deterministicNotes: string[];
}): Promise<{ html: string; report: FormatReport }> {
  const fallback = (note: string) => ({
    html: input.html,
    report: {
      mode: "deterministic" as const,
      note,
      applied: input.deterministicNotes,
      diff: emptyDiff(input.html),
    },
  });
  if (!input.ai) return fallback("Bỏ qua bước AI định dạng: chưa cấu hình OPENAI_API_KEY.");

  const candidates = findFormatCandidates(input.html);
  let parsed: Record<string, unknown> | null;
  let error: string | null;
  try {
    ({ parsed, error } = await input.ai(buildFormatMessages(input.prompt, candidates, input.lang)));
  } catch (err) {
    parsed = null;
    error = err instanceof Error ? err.message : String(err);
  }
  if (!parsed) return fallback(`Bỏ qua bước AI định dạng: ${error ?? "AI không trả về JSON."}`);

  const response = responseSchema.safeParse(parsed);
  if (!response.success) {
    return fallback(
      "AI trả về danh sách chỉnh sửa sai định dạng — chỉ áp dụng chuẩn hóa bằng code.",
    );
  }
  try {
    const result = applyFormatEdits(input.html, candidates, response.data.edits, input.lang);
    return {
      html: result.html,
      report: {
        mode: "ai",
        note: response.data.notes?.trim() || null,
        applied: [...input.deterministicNotes, ...result.applied],
        diff: result.diff,
      },
    };
  } catch (err) {
    const reason =
      err instanceof FormatRejected ? err.message : "Lỗi khi áp dụng chỉnh sửa của AI.";
    if (!(err instanceof FormatRejected)) console.error("[landing] format apply failed", err);
    return fallback(`${reason} Đã dùng bản chuẩn hóa bằng code.`);
  }
}
