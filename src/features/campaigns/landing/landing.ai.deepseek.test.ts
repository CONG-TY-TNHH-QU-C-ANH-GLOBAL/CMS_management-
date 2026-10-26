// DeepSeek provider + the Claude→DeepSeek chain. The HTTP boundary is faked, so
// the request body DeepSeek really receives, the JSON parsing, retries and the
// error reasons are all exercised without a network call.

import { describe, expect, test } from "bun:test";

import type { JsonAiCall, JsonAiRequest } from "./landing.ai";
import { createAiChain } from "./landing.ai.chain";
import { createDeepSeekAi, schemaInstruction } from "./landing.ai.deepseek";
import { runAuditStep } from "./landing.audit";

const REQUEST: JsonAiRequest = {
  system: "You are the auditor.",
  user: '{"visible_text":"hello"}',
  schema: { type: "object", properties: { findings: { type: "array" } }, required: ["findings"] },
  effort: "high",
  maxTokens: 4096,
  timeoutMs: 5000,
};

type Call = { url: string; headers: Headers; body: Record<string, unknown> };

function fakeFetch(replies: (Response | (() => never))[]) {
  const calls: Call[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
    });
    const next = replies.shift();
    if (!next) throw new Error("no reply queued");
    if (typeof next === "function") return next();
    return next;
  }) as typeof fetch;
  return { impl, calls };
}

const ok = (content: string, finish_reason = "stop") =>
  new Response(
    JSON.stringify({
      model: "deepseek-flash",
      choices: [{ message: { content }, finish_reason }],
      usage: { prompt_tokens: 120, completion_tokens: 30 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

describe("createDeepSeekAi", () => {
  test("sends an OpenAI-compatible JSON request with the schema in the system prompt", async () => {
    const { impl, calls } = fakeFetch([ok('{"findings":[]}')]);
    const ai = createDeepSeekAi({ apiKey: "sk-test", fetch: impl });

    const result = await ai(REQUEST);

    expect(result.parsed).toEqual({ findings: [] });
    expect(result.error).toBeNull();
    expect(result.usage).toEqual({ model: "deepseek-flash", input_tokens: 120, output_tokens: 30 });
    expect(calls[0].url).toBe("https://api.deepseek.com/chat/completions");
    expect(calls[0].headers.get("authorization")).toBe("Bearer sk-test");
    expect(calls[0].body.model).toBe("deepseek-flash");
    expect(calls[0].body.max_tokens).toBe(30000);
    expect(calls[0].body.thinking).toEqual({ type: "enabled" });
    expect(calls[0].body.reasoning_effort).toBe("high");
    expect(calls[0].body.response_format).toEqual({ type: "json_object" });
    const messages = calls[0].body.messages as { role: string; content: string }[];
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain(schemaInstruction(REQUEST.schema));
    expect(messages[0].content).toContain('"findings"');
    expect(messages[1]).toEqual({ role: "user", content: REQUEST.user });
  });

  test("honours the model and base URL overrides", async () => {
    const { impl, calls } = fakeFetch([ok("{}")]);
    const ai = createDeepSeekAi({
      apiKey: "sk-test",
      model: "deepseek-v4-pro",
      baseURL: "https://proxy.test/v1/",
      fetch: impl,
    });
    await ai(REQUEST);
    expect(calls[0].url).toBe("https://proxy.test/v1/chat/completions");
    expect(calls[0].body.model).toBe("deepseek-v4-pro");
  });

  test("format keeps reasoning enabled at low effort with a 30000 token budget", async () => {
    const { impl, calls } = fakeFetch([ok('{"edits":[]}')]);
    await createDeepSeekAi({ apiKey: "sk-test", fetch: impl })({
      ...REQUEST,
      effort: "low",
      maxTokens: 8000,
    });
    expect(calls[0].body.thinking).toEqual({ type: "enabled" });
    expect(calls[0].body.reasoning_effort).toBe("low");
    expect(calls[0].body.max_tokens).toBe(30000);
  });

  test.each([
    "content_filter",
    "insufficient_system_resource",
    "aborted",
    "tool_calls",
    "unknown",
    null,
  ])("rejects JSON from an incomplete response (%s)", async (reason) => {
    const { impl } = fakeFetch([
      Response.json({
        choices: [{ message: { content: '{"findings":[]}' }, finish_reason: reason }],
      }),
    ]);
    const result = await createDeepSeekAi({ apiKey: "sk-test", fetch: impl })(REQUEST);
    expect(result.parsed).toBeNull();
    expect(result.error).toContain("finish_reason");
  });

  test.each([
    [{ severity: "CRITICAL", category: "origin", message: "wrong origin", evidence: "$10 vs $20" }],
    [{ severity: "critical", category: "origin", message: "wrong origin", evidence: "$10" }, null],
    [{ severity: "critical", category: "invalid", message: "wrong origin", evidence: "$10" }],
    [{ severity: "critical", category: "origin", message: "wrong origin" }],
  ])("malformed audit findings are reported as a failed audit: %j", async (...findings) => {
    const { impl } = fakeFetch([ok(JSON.stringify({ findings }))]);
    const result = await runAuditStep({
      html: "<p>Price $10 vs $20</p>",
      prompt: "Return JSON",
      ruleFindings: [],
      context: { campaignTitle: "Test", startDate: null, endDate: null, today: "2026-10-26" },
      ai: createDeepSeekAi({ apiKey: "sk-test", fetch: impl }),
    });
    expect(result.mode).toBe("rules");
    expect(result.note).toContain("sai định dạng");
    expect(result.ai_usage?.model).toBe("deepseek-flash");
  });

  test("a reply cut off by max_tokens is an error, not a partial result", async () => {
    const { impl } = fakeFetch([ok('{"findings":[', "length")]);
    const result = await createDeepSeekAi({ apiKey: "sk-test", fetch: impl })(REQUEST);
    expect(result.parsed).toBeNull();
    expect(result.error).toContain("max_tokens");
  });

  test("DeepSeek audit ignores pricing but keeps origin findings", async () => {
    const { impl } = fakeFetch([
      ok(
        JSON.stringify({
          findings: [
            {
              severity: "major",
              category: "price",
              message: "Price mismatch",
              evidence: "$10 vs $20",
            },
            {
              severity: "critical",
              category: "origin",
              message: "Origin mismatch",
              evidence: "USA vs VN",
            },
          ],
        }),
      ),
    ]);
    const result = await runAuditStep({
      html: "<p>Made in USA vs VN</p>",
      prompt: "Return JSON",
      ruleFindings: [],
      context: { campaignTitle: "Test", startDate: null, endDate: null, today: "2026-10-26" },
      ai: createDeepSeekAi({ apiKey: "mock", fetch: impl }),
    });
    expect(result.mode).toBe("ai");
    expect(result.findings.map((f) => f.category)).toEqual(["origin"]);
  });

  test("invalid JSON is reported, never thrown", async () => {
    const { impl } = fakeFetch([ok("not json")]);
    const result = await createDeepSeekAi({ apiKey: "sk-test", fetch: impl })(REQUEST);
    expect(result.parsed).toBeNull();
    expect(result.error).toContain("JSON");
  });

  test("401 names the key and never leaks the key value", async () => {
    const { impl } = fakeFetch([new Response("unauthorized", { status: 401 })]);
    const result = await createDeepSeekAi({ apiKey: "sk-secret-value", fetch: impl })(REQUEST);
    expect(result.parsed).toBeNull();
    expect(result.error).toContain("DEEPSEEK_API_KEY");
    expect(result.error).not.toContain("sk-secret-value");
  });

  test("429 is retried once, then succeeds", async () => {
    const { impl, calls } = fakeFetch([
      new Response("slow down", { status: 429 }),
      ok('{"findings":[]}'),
    ]);
    const result = await createDeepSeekAi({ apiKey: "sk-test", maxRetries: 1, fetch: impl })(
      REQUEST,
    );
    expect(result.parsed).toEqual({ findings: [] });
    expect(calls).toHaveLength(2);
  });

  test.each([429, 503])("%s respects Retry-After seconds", async (status) => {
    const { impl, calls } = fakeFetch([
      new Response("busy", { status, headers: { "Retry-After": "0.05" } }),
      ok('{"findings":[]}'),
    ]);
    const started = performance.now();
    const result = await createDeepSeekAi({ apiKey: "mock", fetch: impl })(REQUEST);
    expect(performance.now() - started).toBeGreaterThanOrEqual(45);
    expect(result.parsed).toEqual({ findings: [] });
    expect(calls).toHaveLength(2);
  });

  test("respects Retry-After HTTP dates", async () => {
    const retryAt = Math.ceil(Date.now() / 1000) * 1000 + 1000;
    const { impl } = fakeFetch([
      new Response("busy", {
        status: 429,
        headers: { "Retry-After": new Date(retryAt).toUTCString() },
      }),
      ok('{"findings":[]}'),
    ]);
    const result = await createDeepSeekAi({ apiKey: "mock", fetch: impl })(REQUEST);
    expect(Date.now()).toBeGreaterThanOrEqual(retryAt - 10);
    expect(result.parsed).toEqual({ findings: [] });
  });

  test.each([null, "invalid", "-1"])("uses a short backoff for Retry-After %s", async (header) => {
    const { impl } = fakeFetch([
      new Response("busy", {
        status: 503,
        headers: header === null ? {} : { "Retry-After": header },
      }),
      ok('{"findings":[]}'),
    ]);
    const started = performance.now();
    const result = await createDeepSeekAi({ apiKey: "mock", fetch: impl })(REQUEST);
    expect(performance.now() - started).toBeGreaterThanOrEqual(450);
    expect(result.parsed).toEqual({ findings: [] });
  });

  test("does not retry early when Retry-After exceeds the remaining timeout", async () => {
    const { impl, calls } = fakeFetch([
      new Response("busy", { status: 429, headers: { "Retry-After": "60" } }),
      ok('{"findings":[]}'),
    ]);
    const result = await createDeepSeekAi({ apiKey: "mock", fetch: impl })({
      ...REQUEST,
      timeoutMs: 50,
    });
    expect(result.error).toContain("429");
    expect(calls).toHaveLength(1);
  });

  test("retry shares the original timeout budget", async () => {
    const signals: AbortSignal[] = [];
    const impl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      signals.push(init!.signal!);
      if (signals.length === 1)
        return new Response("busy", { status: 503, headers: { "Retry-After": "0.05" } });
      return new Promise<Response>((_resolve, reject) => {
        init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true });
      });
    }) as typeof fetch;
    const result = await createDeepSeekAi({ apiKey: "mock", fetch: impl })({
      ...REQUEST,
      timeoutMs: 100,
    });
    expect(result.error).toContain("timeout");
    expect(signals).toHaveLength(2);
    expect(signals[1]).toBe(signals[0]);
  });

  test("maxRetries zero never waits or calls a second time", async () => {
    const { impl, calls } = fakeFetch([
      new Response("busy", { status: 503, headers: { "Retry-After": "60" } }),
    ]);
    const result = await createDeepSeekAi({ apiKey: "mock", fetch: impl, maxRetries: 0 })(REQUEST);
    expect(result.error).toContain("503");
    expect(calls).toHaveLength(1);
  });

  test("stops after one retry and preserves the final HTTP error", async () => {
    const { impl, calls } = fakeFetch([
      new Response("busy", { status: 429, headers: { "Retry-After": "0" } }),
      new Response("unavailable", { status: 503, headers: { "Retry-After": "0" } }),
      ok('{"findings":[]}'),
    ]);
    const result = await createDeepSeekAi({ apiKey: "mock", fetch: impl })(REQUEST);
    expect(result.error).toContain("503");
    expect(result.parsed).toBeNull();
    expect(calls).toHaveLength(2);
  });

  test("a network failure is reported as a reason", async () => {
    const { impl } = fakeFetch([
      () => {
        throw new TypeError("fetch failed");
      },
    ]);
    const result = await createDeepSeekAi({ apiKey: "sk-test", fetch: impl })(REQUEST);
    expect(result.parsed).toBeNull();
    expect(result.error).toContain("Không kết nối được");
  });
});

describe("createAiChain", () => {
  const stub = (name: string, result: Awaited<ReturnType<JsonAiCall>>): JsonAiCall => {
    return async () => result;
  };

  test("returns the first provider that parses, so DeepSeek covers a Claude 400", async () => {
    const chain = createAiChain([
      {
        name: "Claude",
        call: stub("Claude", {
          parsed: null,
          error: "Claude API từ chối yêu cầu (400).",
          usage: null,
        }),
      },
      {
        name: "DeepSeek",
        call: stub("DeepSeek", { parsed: { findings: [] }, error: null, usage: null }),
      },
    ]);
    const result = await chain(REQUEST);
    expect(result.parsed).toEqual({ findings: [] });
    expect(result.error).toBeNull();
  });

  test("short-circuits on the first success", async () => {
    let deepseekCalls = 0;
    const chain = createAiChain([
      { name: "Claude", call: async () => ({ parsed: { ok: true }, error: null, usage: null }) },
      {
        name: "DeepSeek",
        call: async () => {
          deepseekCalls += 1;
          return { parsed: { ok: true }, error: null, usage: null };
        },
      },
    ]);
    await chain(REQUEST);
    expect(deepseekCalls).toBe(0);
  });

  test("when every provider fails the reason names each one", async () => {
    const chain = createAiChain([
      {
        name: "Claude",
        call: async () => ({ parsed: null, error: "Claude API lỗi (400).", usage: null }),
      },
      {
        name: "DeepSeek",
        call: async () => ({
          parsed: null,
          error: "Tài khoản DeepSeek hết số dư (402).",
          usage: null,
        }),
      },
    ]);
    const result = await chain(REQUEST);
    expect(result.parsed).toBeNull();
    expect(result.error).toContain("Claude");
    expect(result.error).toContain("DeepSeek");
  });
});
