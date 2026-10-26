// AI format + audit steps with Claude mocked at the HTTP boundary only: the real
// Anthropic SDK (through landing.ai) talks to a fake Messages endpoint served by
// the `fetch` option, so request shape, stop_reason handling and typed SDK
// errors are all exercised for real.

import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createLandingAi, type JsonAiCall } from "./landing.ai";
import { AUDIT_OUTPUT_SCHEMA, parseAuditFindings, runAuditStep } from "./landing.audit";
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
const API = "https://api.anthropic.test";

// ── Fake Messages endpoint ───────────────────────────────────────────────────
type Reply =
  | { kind: "message"; text: string; stop_reason?: string; stop_details?: unknown }
  | { kind: "status"; status: number; body: unknown; headers?: Record<string, string> }
  | { kind: "hang" };
let replies: Reply[] = [];
let requests: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];

const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  requests.push({
    url: String(input),
    headers: new Headers(init?.headers),
    body: JSON.parse(String(init?.body)),
  });
  const reply = replies.shift() ?? { kind: "message", text: "{}" };
  if (reply.kind === "hang") {
    return new Promise<Response>((_, reject) =>
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("The operation was aborted.", "AbortError")),
      ),
    );
  }
  const json = { "content-type": "application/json" };
  if (reply.kind === "status") {
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { ...json, ...reply.headers },
    });
  }
  return new Response(
    JSON.stringify({
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "claude-opus-5-5",
      content: reply.text ? [{ type: "text", text: reply.text }] : [],
      stop_reason: reply.stop_reason ?? "end_turn",
      stop_sequence: null,
      stop_details: reply.stop_details ?? null,
      usage: { input_tokens: 1200, output_tokens: 80 },
    }),
    { status: 200, headers: json },
  );
}) as typeof fetch;

beforeEach(() => {
  replies = [];
  requests = [];
});

const ai = (maxRetries = 0) =>
  createLandingAi({ apiKey: "sk-ant-test-key", baseURL: API, maxRetries, fetch: fakeFetch });
const replyWith = (value: unknown) =>
  replies.push({ kind: "message", text: JSON.stringify(value) });
const apiError = (status: number, type: string, headers?: Record<string, string>) =>
  replies.push({
    kind: "status",
    status,
    body: { type: "error", error: { type, message: `${type} (fake)` } },
    headers,
  });
const format = (call: JsonAiCall = ai()) =>
  runFormatStep({
    html: BASE.html,
    lang: BASE.lang,
    prompt: FORMAT_PROMPT,
    ai: call,
    deterministicNotes: BASE.notes,
  });
/** Edits as the structured-output schema returns them: every field present. */
const edit = (op: string, target: string, replacement = "none") => ({ op, target, replacement });

const candidates = findFormatCandidates(BASE.html);
const siteHeader = candidates.header.find((h) => h.tag === "header")!;
const TOPBAR_START = BASE.html.indexOf('<div class="topbar">');
const TOPBAR = BASE.html.slice(TOPBAR_START, BASE.html.indexOf("</div>", TOPBAR_START) + 6);

describe("format candidates on the Christmas sample", () => {
  test("offers only the real site header (never the promo topbar), six old-brand spots and no broken links", () => {
    expect(candidates.header.map((h) => [h.id, h.tag])).toEqual([["h1", "header"]]);
    expect(siteHeader.text).toContain("THG FULFILL");
    expect(candidates.header.some((h) => h.text.includes("Mùa cao điểm Q4"))).toBe(false);
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
        edit("replace_header", siteHeader.id),
        ...candidates.brand.map((b) => edit("fix_brand", b.id, "TH Group")),
        edit("mark_consult", card.id),
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

    expect(report.ai_usage).toEqual({
      model: "claude-opus-5-5",
      input_tokens: 1200,
      output_tokens: 80,
    });

    // One Messages request with the documented shape.
    expect(requests).toHaveLength(1);
    const req = requests[0];
    expect(req.url).toBe(`${API}/v1/messages`);
    // SDK 1.x sends the API key as a bearer credential.
    expect(req.headers.get("authorization")).toBe("Bearer sk-ant-test-key");
    expect(req.headers.get("anthropic-beta")).toBe("server-side-fallback-2026-07-01");
    expect(req.body).toMatchObject({
      model: "claude-opus-5-5",
      max_tokens: 8000,
      system: FORMAT_PROMPT,
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema" } },
    });
    for (const banned of ["thinking", "temperature", "top_p", "top_k", "betas"]) {
      expect(req.body).not.toHaveProperty(banned);
    }
    const messages = req.body.messages as { role: string; content: string }[];
    expect(messages.map((m) => m.role)).toEqual(["user"]); // no assistant prefill
    const payload = JSON.parse(messages[0].content);
    expect(payload.header_candidates.map((h: { id: string }) => h.id)).toEqual(
      candidates.header.map((h) => h.id),
    );
    expect(payload.brand_occurrences).toHaveLength(6);
  });

  test("an empty edit list is valid and changes nothing", async () => {
    replyWith({ edits: [], notes: "" });
    const { html, report } = await format();
    expect(report.mode).toBe("ai");
    expect(html).toBe(BASE.html);
  });
});

describe("runFormatStep falls back to deterministic output", () => {
  const expectFallback = async (pattern: RegExp, call?: JsonAiCall) => {
    const { html, report } = await format(call);
    expect(report.mode).toBe("deterministic");
    expect(report.note).toMatch(pattern);
    expect(report.applied).toEqual(BASE.notes);
    expect(html).toBe(BASE.html);
  };

  test("when the AI names an id that does not exist", async () => {
    replyWith({ edits: [edit("mark_consult", "c999")], notes: "" });
    await expectFallback(/không tồn tại: c999/);
  });

  test("when the AI picks two headers", async () => {
    replyWith({
      edits: [edit("replace_header", siteHeader.id), edit("replace_header", "h2")],
      notes: "",
    });
    await expectFallback(/nhiều hơn một header/);
  });

  test("when the edit list does not match the schema", async () => {
    replyWith({ edits: [{ op: "rewrite_copy", target: "b1", text: "Giá mới $1" }] });
    await expectFallback(/sai định dạng/);
    replyWith({ edits: [edit("fix_brand", "b1", "none")], notes: "" });
    await expectFallback(/sai định dạng/);
  });

  test("when the output is not JSON", async () => {
    replies.push({ kind: "message", text: "Sure! Here are the edits." });
    await expectFallback(/JSON không hợp lệ/);
  });

  test("when Claude refuses (stop_reason refusal, checked before content)", async () => {
    replies.push({
      kind: "message",
      text: '{"edits":[],"notes":""}',
      stop_reason: "refusal",
      stop_details: { type: "refusal", category: "cyber", explanation: null },
    });
    await expectFallback(/từ chối xử lý \(refusal: cyber\)/);
  });

  test("when the output hits max_tokens", async () => {
    replies.push({ kind: "message", text: '{"edits":[', stop_reason: "max_tokens" });
    await expectFallback(/hết max_tokens/);
  });

  test("on 429 (RateLimitError)", async () => {
    apiError(429, "rate_limit_error");
    await expectFallback(/429/);
    expect(requests).toHaveLength(1);
  });

  test("on 500, after the single SDK retry (InternalServerError)", async () => {
    apiError(500, "api_error", { "retry-after-ms": "1" });
    apiError(500, "api_error", { "retry-after-ms": "1" });
    await expectFallback(/lỗi máy chủ \(500\)/, ai(1));
    expect(requests).toHaveLength(2);
  });

  test("on 401, without leaking the key", async () => {
    apiError(401, "authentication_error");
    const { report } = await format();
    expect(report.mode).toBe("deterministic");
    expect(report.note).toContain("ANTHROPIC_API_KEY không hợp lệ");
    expect(JSON.stringify(report)).not.toContain("sk-ant-test-key");
  });

  test("on timeout (APIConnectionTimeoutError)", async () => {
    replies.push({ kind: "hang" });
    const base = ai();
    const fast: JsonAiCall = (request) => base({ ...request, timeoutMs: 30 });
    await expectFallback(/timeout/, fast);
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
    expect(report.note).toContain("ANTHROPIC_API_KEY");
    expect(requests).toEqual([]);
  });

  test("the promo topbar survives a header swap byte-identically, leaving exactly one header", async () => {
    expect(TOPBAR).toContain("Mùa cao điểm Q4 đã bắt đầu");
    replyWith({ edits: [edit("replace_header", siteHeader.id)], notes: "" });
    const { html, report } = await format();
    expect(report.mode).toBe("ai");
    expect(html.split(TOPBAR)).toHaveLength(2);
    expect(html.match(/<header\b/g)).toHaveLength(1);
    expect(html).toContain('<header id="thg-header">');
  });

  test("an id for the topbar (no longer offered) is rejected", async () => {
    replyWith({ edits: [edit("replace_header", "h2")], notes: "" });
    await expectFallback(/không tồn tại: h2/);
  });

  test("replacing one of two site headers is rejected (would leave two headers)", async () => {
    const page = normalizeLandingHtml(
      `<html><body><header><a href="/">Logo</a></header><nav><a href="#a">A</a></nav><section>${"x ".repeat(2000)}</section></body></html>`,
      "x",
    ).html;
    const found = findFormatCandidates(page);
    expect(found.header.map((h) => h.tag)).toEqual(["header", "nav"]);
    expect(() =>
      applyFormatEdits(page, found, [{ op: "replace_header", target: "h1" }], "vi"),
    ).toThrow(/còn một header khác/);
  });

  test("a header-named strip with substantial non-nav text is rejected", async () => {
    const promo =
      "Giảm giá 50% toàn bộ sản phẩm Giáng sinh, chỉ trong tuần này, áp dụng cho mọi seller mới đăng ký tài khoản trước ngày 25/12. ".repeat(
        2,
      );
    const page = normalizeLandingHtml(
      `<html><body><header><a href="/">Logo</a><p>${promo}</p><nav><a href="#a">A</a></nav></header><section>${"x ".repeat(2000)}</section></body></html>`,
      "x",
    ).html;
    const found = findFormatCandidates(page);
    expect(() =>
      applyFormatEdits(page, found, [{ op: "replace_header", target: "h1" }], "vi"),
    ).toThrow(/quá nhiều nội dung/);
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
  test("both providers receive a shared audit policy excluding pricing", () => {
    expect(AUDIT_PROMPT).toContain("Do not audit or report pricing");
    expect(JSON.stringify(AUDIT_OUTPUT_SCHEMA)).not.toContain('"price"');
  });

  test("ignores price findings without losing valid non-price findings", () => {
    expect(
      parseAuditFindings({
        findings: [
          {
            severity: "critical",
            category: "price",
            message: "Price mismatch",
            evidence: "$10 vs $20",
          },
          {
            severity: "major",
            category: "origin",
            message: "Origin mismatch",
            evidence: "USA vs VN",
          },
        ],
      }),
    ).toEqual([
      {
        severity: "major",
        category: "origin",
        message: "Origin mismatch",
        evidence: "USA vs VN",
        source: "ai",
      },
    ]);
    expect(parseAuditFindings({ findings: [{ category: "price" }] })).toEqual([]);
  });
  const context = {
    campaignTitle: "Christmas 2026 Collection",
    startDate: "2026-10-24",
    endDate: "2026-12-25",
    today: "2026-10-24",
  };

  test("Claude audit ignores pricing but keeps origin findings", async () => {
    replyWith({
      findings: [
        { severity: "major", category: "price", message: "Price mismatch", evidence: "$10 vs $20" },
        {
          severity: "critical",
          category: "origin",
          message: "Origin mismatch",
          evidence: "USA vs VN",
        },
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
    expect(result.findings.map((f) => f.category)).toEqual(["origin"]);
  });

  test("parses valid AI findings and tags them as AI", async () => {
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
        {
          severity: "minor",
          category: "content",
          message: "Content issue.",
          evidence: "",
        },
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
    expect(requests[0].body).toMatchObject({
      system: AUDIT_PROMPT,
      max_tokens: 16000,
      fallbacks: "default",
      output_config: { effort: "high", format: { type: "json_schema" } },
    });
    expect(result.ai_usage?.output_tokens).toBe(80);
    const payload = JSON.parse((requests[0].body.messages as { content: string }[])[0].content);
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
    expect(none.note).toContain("ANTHROPIC_API_KEY");
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
    apiError(529, "overloaded_error");
    const overloaded = await runAuditStep({
      html: BASE.html,
      prompt: AUDIT_PROMPT,
      ai: ai(),
      context,
      ruleFindings: [],
    });
    expect(overloaded.mode).toBe("rules");
    expect(overloaded.note).toMatch(/lỗi/);
  });
});

// ── Adversarial model ────────────────────────────────────────────────────────
// The model is treated as hostile: whatever it answers, content (prices, product names,
// claims) must come out byte-identical, and any edit outside the four allowed kinds must
// fall back to the deterministic output with the reason recorded.

/** Every price and product name in the page, with multiplicity: an oracle independent of the
 *  format code (plain regexes over the raw file). */
function contentFingerprint(html: string): string[] {
  const prices =
    html.match(/\$\s?\d{1,5}(?:[.,]\d{1,2})?(?:\s?–\s?\$\d{1,5}(?:[.,]\d{1,2})?)?/g) ?? [];
  const names = [...html.matchAll(/\bname:"([^"]+)"/g)].map((m) => `name:${m[1]}`);
  const origins = html.match(/Made in (?:VN|USA|China)/g) ?? [];
  return [...prices, ...names, ...origins].sort();
}

describe("runFormatStep against an adversarial model", () => {
  const expectDeterministic = async (pattern: RegExp) => {
    const { html, report } = await format();
    expect(report.mode).toBe("deterministic");
    expect(report.note).toMatch(pattern);
    expect(html).toBe(BASE.html);
  };
  const card = candidates.consult[0];

  test("ids of another kind, or never offered, are rejected", async () => {
    for (const bad of [
      edit("mark_consult", candidates.brand[0].id),
      edit("fix_brand", card.id, "TH Group"),
      edit("absolutize_link", siteHeader.id),
      edit("replace_header", card.id),
      edit("mark_consult", "c0"),
      edit("fix_brand", "b7", "TH Group"),
      edit("mark_consult", "__proto__"),
      edit("absolutize_link", ""),
    ]) {
      // A valid edit beside the bad one: the whole list is still refused.
      const valid =
        bad.op === "replace_header"
          ? edit("mark_consult", card.id)
          : edit("replace_header", siteHeader.id);
      replyWith({ edits: [valid, bad], notes: "" });
      await expectDeterministic(/không tồn tại/);
    }
  });

  test("markup or prices cannot be smuggled through a replacement or extra fields", async () => {
    for (const replacement of [
      "<script>alert(1)</script>",
      'TH Group"><script>alert(1)</script>',
      "TH Group $0.99",
      "TH Group ",
    ]) {
      replyWith({ edits: [edit("fix_brand", "b5", replacement)], notes: "" });
      await expectDeterministic(/sai định dạng/);
    }
    // Unknown fields are ignored, never applied.
    replyWith({
      edits: [
        {
          ...edit("fix_brand", "b5", "TH Group"),
          html: "<script>alert(1)</script>",
          text: "$0.01",
          start: 0,
          end: 999999,
        },
      ],
      notes: "",
    });
    const { html, report } = await format();
    expect(report.mode).toBe("ai");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("$0.01");
    expect(html.length - BASE.html.length).toBe("TH Group".length - "THG Fulfill".length);
  });

  test("oversized answers are rejected", async () => {
    const many = Array.from({ length: 801 }, () => edit("mark_consult", card.id));
    replyWith({ edits: many, notes: "" });
    await expectDeterministic(/sai định dạng/);
    replyWith({ edits: [], notes: "x".repeat(2001) });
    await expectDeterministic(/sai định dạng/);
  });

  test("a repeated edit is applied once", async () => {
    replyWith({
      edits: [edit("fix_brand", "b5", "TH Group"), edit("fix_brand", "b5", "TH Group Fulfill")],
      notes: "",
    });
    const { html, report } = await format();
    expect(report.diff.brandFixed).toBe(1);
    expect(html).toContain("TH Group · Seller");
    expect(html).not.toContain("TH Group Fulfill · Seller");
  });

  test("non-JSON 200 bodies and non-text content blocks fall back", async () => {
    replies.push({ kind: "status", status: 200, body: "<html>proxy error</html>" });
    await expectDeterministic(/Bước AI định dạng lỗi/);
    replies.push({ kind: "message", text: "" });
    await expectDeterministic(/JSON không hợp lệ/);
    replies.push({ kind: "message", text: "[1,2,3]" });
    await expectDeterministic(/JSON không hợp lệ/);
  });

  test("the most aggressive VALID edit list keeps every price, product name and origin", async () => {
    replyWith({
      edits: [
        edit("replace_header", siteHeader.id),
        ...candidates.brand.map((b) => edit("fix_brand", b.id, "TH Group Fulfill")),
        ...candidates.consult.map((c) => edit("mark_consult", c.id)),
        ...candidates.links.map((l) => edit("absolutize_link", l.id)),
      ],
      notes: "",
    });
    const { html, report } = await format();
    expect(report.mode).toBe("ai");
    // The replaced site header holds no prices or product names, so the fingerprint of the
    // whole page is unchanged.
    expect(contentFingerprint(siteHeader.markup)).toEqual([]);
    expect(contentFingerprint(html)).toEqual(contentFingerprint(SAMPLE));
    expect(contentFingerprint(SAMPLE).length).toBeGreaterThan(60);
    // The product data script is byte-identical.
    const data = (page: string) =>
      page.slice(page.indexOf('{id:"advent-pet"'), page.indexOf('{id:"golf-towel"'));
    expect(data(html)).toBe(data(SAMPLE));
  });

  test("links: only root-relative or scheme-less thgfulfill hrefs are candidates, and absolutizing keeps the host", async () => {
    const page = normalizeLandingHtml(
      `<html><body><section>` +
        `<a href="javascript:alert(1)">Tư vấn</a>` +
        `<a href="thgfulfill.com.evil.example/x">a</a>` +
        `<a href="//evil.example/x">b</a>` +
        `<a href="/vi/catalog">c</a>` +
        `<a href="/\\evil.example">d</a>` +
        `</section></body></html>`,
      "x",
    ).html;
    const found = findFormatCandidates(page);
    expect(found.links.map((l) => l.href)).toEqual(["/vi/catalog", "/\\evil.example"]);
    const out = applyFormatEdits(
      page,
      found,
      found.links.map((l) => ({ op: "absolutize_link" as const, target: l.id })),
      "vi",
    );
    expect(out.html).toContain('href="https://thgfulfill.com/vi/catalog"');
    expect(new URL("https://thgfulfill.com/\\evil.example").hostname).toBe("thgfulfill.com");
    expect(out.html).toContain('href="javascript:alert(1)"'); // untouched, never rewritten
  });
});

describe("runAuditStep against an adversarial model", () => {
  const context = {
    campaignTitle: "Christmas 2026 Collection",
    startDate: "2026-10-24",
    endDate: "2026-12-25",
    today: "2026-10-24",
  };
  const audit = () =>
    runAuditStep({ html: BASE.html, prompt: AUDIT_PROMPT, ai: ai(), context, ruleFindings: [] });
  const valid = (i: number) => ({
    severity: "minor",
    category: "content",
    message: `m${i}`,
    evidence: "",
  });

  test("junk items invalidate the audit instead of silently dropping findings", async () => {
    replyWith({
      findings: [
        null,
        "critical: everything is wrong",
        42,
        [],
        { severity: "critical", category: "origin", message: "", evidence: "" },
        { severity: "critical", category: "origin", message: "x".repeat(601), evidence: "" },
        { severity: "critical", category: "origin", message: "ok", evidence: "e".repeat(601) },
        {
          severity: "major",
          category: "origin",
          message: "Giá copy",
          evidence: "<b>$12.70</b>",
          source: "rule",
        },
      ],
    });
    const result = await audit();
    expect(result.mode).toBe("rules");
    expect(result.findings).toEqual([]);
    expect(result.note).toContain("sai định dạng");
  });

  test("the model cannot claim to be a rule", async () => {
    replyWith({
      findings: [
        {
          severity: "major",
          category: "origin",
          message: "Giá copy",
          evidence: "<b>$12.70</b>",
          source: "rule",
        },
      ],
    });
    const result = await audit();
    expect(result.mode).toBe("ai");
    expect(result.findings).toEqual([
      {
        severity: "major",
        category: "origin",
        message: "Giá copy",
        evidence: "<b>$12.70</b>",
        source: "ai",
      },
    ]);
  });

  test("more than 100 findings is junk as a whole; up to 100 are capped at 40", async () => {
    replyWith({ findings: Array.from({ length: 101 }, (_, i) => valid(i)) });
    const flood = await audit();
    expect(flood).toMatchObject({ mode: "rules", findings: [] });
    expect(flood.note).toContain("sai định dạng");
    replyWith({ findings: Array.from({ length: 100 }, (_, i) => valid(i)) });
    const capped = await audit();
    expect(capped.findings).toHaveLength(40);
    expect(capped.findings[39].message).toBe("m39");
  });
});
