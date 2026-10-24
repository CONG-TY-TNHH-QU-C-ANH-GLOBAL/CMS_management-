// AI format + audit steps with the model mocked at the HTTP boundary only:
// globalThis.fetch answers like the OpenAI Chat Completions API, and the real
// client (translations.openai via landing.ai) parses it.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { openAiJsonCall } from "./landing.ai";
import { runAuditStep } from "./landing.audit";
import {
  FormatRejected,
  applyFormatEdits,
  findFormatCandidates,
  runFormatStep,
  validateFormatted,
} from "./landing.format";
import { HEADER_START } from "./landing.header";
import { contentProjection } from "./landing.html";
import { normalizeLandingHtml } from "./landing.normalize";

const dir = import.meta.dir;
const SAMPLE = readFileSync(join(dir, "__fixtures__", "xmas-index.html"), "utf8");
const FORMAT_PROMPT = readFileSync(join(dir, "format.prompt.md"), "utf8");
const AUDIT_PROMPT = readFileSync(join(dir, "audit.prompt.md"), "utf8");
const BASE = normalizeLandingHtml(SAMPLE, "christmas-2026");

// ── HTTP mock ────────────────────────────────────────────────────────────────
type Reply = { status?: number; content?: string; body?: unknown };
let replies: Reply[] = [];
let requests: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  replies = [];
  requests = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
    });
    const reply = replies.shift() ?? { content: "{}" };
    const body = reply.body ?? {
      choices: [{ message: { content: reply.content ?? "" } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    };
    return new Response(JSON.stringify(body), { status: reply.status ?? 200 });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const ai = () => openAiJsonCall("sk-test", "https://ai.test/v1");
const replyWith = (value: unknown) => replies.push({ content: JSON.stringify(value) });
const format = () =>
  runFormatStep({
    html: BASE.html,
    lang: BASE.lang,
    prompt: FORMAT_PROMPT,
    ai: ai(),
    deterministicNotes: BASE.notes,
  });

const candidates = findFormatCandidates(BASE.html);
const siteHeader = candidates.header.find((h) => h.tag === "header")!;
const topbar = candidates.header.find((h) => h.tag === "div")!;

describe("format candidates on the Christmas sample", () => {
  test("finds the page header, the promo topbar, six old-brand spots and no broken links", () => {
    expect(siteHeader.text).toContain("THG FULFILL");
    expect(topbar.text).toContain("Mùa cao điểm Q4");
    expect(candidates.brand).toHaveLength(6);
    expect(candidates.links).toEqual([]);
    // Buttons that already carry data-consult are not offered again.
    expect(candidates.consult.every((c) => !/^Tư vấn ngay$/.test(c.text))).toBe(true);
  });
});

describe("runFormatStep with a valid edit list", () => {
  test("applies the header swap, brand fixes and consult marks; nothing else changes", async () => {
    const card = candidates.consult[0];
    replyWith({
      edits: [
        { op: "replace_header", target: siteHeader.id },
        ...candidates.brand.map((b) => ({
          op: "fix_brand",
          target: b.id,
          replacement: "TH Group",
        })),
        { op: "mark_consult", target: card.id },
      ],
      notes: "Header đã thay.",
    });
    const { html, report } = await format();

    expect(report.mode).toBe("ai");
    expect(report.note).toBe("Header đã thay.");
    expect(report.diff).toMatchObject({ headerReplaced: true, consultMarked: 1 });
    // Brand spots inside the replaced header are dropped with it.
    expect(report.diff.brandFixed).toBe(4);
    expect(html).toContain(HEADER_START);
    expect(html).not.toContain('<header class="header">');
    expect(html).toContain('href="https://thgfulfill.com/vi/thg-fulfill"');
    expect(html).toContain("Hub System");
    expect(html).toContain(
      "<title>Christmas Collection 2026 – Sản phẩm POD mùa Giáng sinh | TH Group</title>",
    );
    expect(html).not.toMatch(/THG Fulfill(?![\w-])/);
    // Prices, origins and the product data are untouched.
    for (const price of ["$12.70 – $50.50", "$6.88 – $19.95", "Từ <b>$4.50</b>", "Made in VN"]) {
      expect(html).toContain(price);
    }
    // Offsets moved with the header swap, so find the marked tag by its original text.
    const cardTag = BASE.html.slice(card.tag.start, card.tag.end);
    expect(html).toContain(`${cardTag.slice(0, -1)} data-consult>`);

    // The real client sent the preset prompt and the candidates, nothing else.
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://ai.test/v1/chat/completions");
    expect(requests[0].headers.get("authorization")).toBe("Bearer sk-test");
    const messages = requests[0].body.messages as { role: string; content: string }[];
    expect(messages[0]).toEqual({ role: "system", content: FORMAT_PROMPT });
    const payload = JSON.parse(messages[1].content);
    expect(payload.header_candidates.map((h: { id: string }) => h.id)).toEqual(
      candidates.header.map((h) => h.id),
    );
    expect(payload.brand_occurrences).toHaveLength(6);
  });

  test("an empty edit list is valid and changes nothing", async () => {
    replyWith({ edits: [] });
    const { html, report } = await format();
    expect(report.mode).toBe("ai");
    expect(html).toBe(BASE.html);
  });
});

describe("runFormatStep falls back to deterministic output", () => {
  const expectFallback = async (pattern: RegExp) => {
    const { html, report } = await format();
    expect(report.mode).toBe("deterministic");
    expect(report.note).toMatch(pattern);
    expect(report.applied).toEqual(BASE.notes);
    expect(html).toBe(BASE.html);
  };

  test("when the AI names an id that does not exist", async () => {
    replyWith({ edits: [{ op: "mark_consult", target: "c999" }] });
    await expectFallback(/không tồn tại: c999/);
  });

  test("when the AI picks two headers", async () => {
    replyWith({
      edits: [
        { op: "replace_header", target: siteHeader.id },
        { op: "replace_header", target: topbar.id },
      ],
    });
    await expectFallback(/nhiều hơn một header/);
  });

  test("when the edit list does not match the schema", async () => {
    replyWith({ edits: [{ op: "rewrite_copy", target: "b1", text: "Giá mới $1" }] });
    await expectFallback(/sai định dạng/);
  });

  test("when the response is not JSON (after the client's one strict retry)", async () => {
    replies.push({ content: "Sure! Here are the edits." }, { content: "still prose" });
    await expectFallback(/AI trả về JSON không hợp lệ/);
    expect(requests).toHaveLength(2);
  });

  test("when the API errors (non-transient, no retry)", async () => {
    replies.push({ status: 401, body: { error: { message: "Incorrect API key" } } });
    await expectFallback(/Incorrect API key/);
    expect(requests).toHaveLength(1);
  });

  test("without an API key, with no request at all", async () => {
    const { report } = await runFormatStep({
      html: BASE.html,
      lang: "vi",
      prompt: FORMAT_PROMPT,
      ai: null,
      deterministicNotes: BASE.notes,
    });
    expect(report.mode).toBe("deterministic");
    expect(report.note).toContain("OPENAI_API_KEY");
    expect(requests).toEqual([]);
  });

  test("when the chosen 'header' actually holds page content", async () => {
    const page = normalizeLandingHtml(
      `<html><body><header class="hero"><h2>Sale</h2><p>${"Nội dung khuyến mãi dài. ".repeat(40)}</p></header><section>x</section></body></html>`,
      "x",
    ).html;
    const found = findFormatCandidates(page);
    expect(() =>
      applyFormatEdits(page, found, [{ op: "replace_header", target: found.header[0].id }], "vi"),
    ).toThrow(FormatRejected);
  });
});

describe("validateFormatted", () => {
  test("rejects any content change outside the header and accepts attribute-only edits", () => {
    const planned = {
      splices: [],
      brandSplices: [],
      header: null,
      applied: [],
      diff: { headerReplaced: false, consultMarked: 0, brandFixed: 0, linksFixed: 0 },
    };
    const priceChanged = BASE.html.replace("$12.70 – $50.50", "$9.99 – $50.50");
    expect(() => validateFormatted(BASE.html, priceChanged, planned)).toThrow(/Nội dung/);
    const tagAdded = BASE.html.replace("<footer", "<div></div><footer");
    expect(() => validateFormatted(BASE.html, tagAdded, planned)).toThrow(/Cấu trúc/);
    const attrOnly = BASE.html.replace('<footer class="footer">', '<footer class="footer" data-x>');
    expect(() => validateFormatted(BASE.html, attrOnly, planned)).not.toThrow();
    expect(contentProjection(attrOnly)).toBe(contentProjection(BASE.html));
  });
});

describe("runAuditStep", () => {
  const context = {
    campaignTitle: "Christmas 2026 Collection",
    startDate: "2026-10-24",
    endDate: "2026-12-25",
    today: "2026-10-24",
  };

  test("parses AI findings, drops malformed ones and tags them as AI", async () => {
    replyWith({
      findings: [
        {
          severity: "critical",
          category: "origin",
          message: "Hero ghi Made in USA nhưng nhiều sản phẩm Made in VN / China.",
          evidence: "Sản xuất tại Mỹ 2–3 ngày",
        },
        {
          severity: "major",
          category: "delivery",
          message: "Thời gian sản xuất mâu thuẫn.",
          evidence: "1–3 vs 2–3",
        },
        { severity: "urgent", category: "price", message: "bad severity" },
        { severity: "minor", category: "weird", message: "Unknown category becomes content." },
      ],
    });
    const result = await runAuditStep({
      html: BASE.html,
      prompt: AUDIT_PROMPT,
      ai: ai(),
      context,
      ruleFindings: [],
    });
    expect(result.mode).toBe("ai");
    expect(result.findings.map((f) => [f.severity, f.category, f.source])).toEqual([
      ["critical", "origin", "ai"],
      ["major", "delivery", "ai"],
      ["minor", "content", "ai"],
    ]);
    const payload = JSON.parse((requests[0].body.messages as { content: string }[])[1].content);
    expect(payload.campaign.endDate).toBe("2026-12-25");
    expect(payload.scripts).toContain("Personalized Microfiber Towel");
    expect(payload.visible_text).toContain("Christmas");
  });

  test("falls back to rules-only when the AI is unavailable or answers badly", async () => {
    const none = await runAuditStep({
      html: BASE.html,
      prompt: AUDIT_PROMPT,
      ai: null,
      context,
      ruleFindings: [],
    });
    expect(none).toMatchObject({ mode: "rules", findings: [] });
    expect(none.note).toContain("OPENAI_API_KEY");
    replyWith({ issues: "none" });
    const bad = await runAuditStep({
      html: BASE.html,
      prompt: AUDIT_PROMPT,
      ai: ai(),
      context,
      ruleFindings: [],
    });
    expect(bad.mode).toBe("rules");
    expect(bad.note).toContain("sai định dạng");
  });
});
