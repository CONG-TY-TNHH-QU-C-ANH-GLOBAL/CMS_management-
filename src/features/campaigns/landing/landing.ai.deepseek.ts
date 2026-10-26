// DeepSeek fallback for the landing AI steps. DeepSeek exposes an
// OpenAI-compatible /chat/completions endpoint, so this is a plain fetch — no
// SDK, no extra dependency in the Worker bundle.
//
// Differences from the Claude path in landing.ai.ts that matter here:
//   - the schema is NOT sent as a JSON-schema output config. DeepSeek supports
//     `response_format: { type: "json_object" }` only, so the schema is
//     appended to the system prompt as text and the reply is parsed the same
//     way (callers already validate the shape with Zod).
//   - `finish_reason: "length"` means the reply was cut off, exactly like
//     Claude's `stop_reason: "max_tokens"`.
// Every failure becomes a Vietnamese reason string and never contains the key.

import type { JsonAiCall, JsonAiRequest, JsonAiResult } from "./landing.ai";

export const DEFAULT_DEEPSEEK_MODEL = "deepseek-flash";
export const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";

export interface DeepSeekOptions {
  apiKey: string;
  model?: string;
  baseURL?: string;
  /** Retries for 429/5xx only. A Worker request should not spend minutes here. */
  maxRetries?: number;
  /** Test hook. */
  fetch?: typeof fetch;
}

/** Appended to the system prompt: DeepSeek's json_object mode needs the schema in text. */
export function schemaInstruction(schema: Record<string, unknown>): string {
  return (
    "\n\nOUTPUT FORMAT\n" +
    "Reply with one JSON object and nothing else: no prose, no markdown fences.\n" +
    "It must validate against this JSON Schema (every required property present, no extra properties):\n" +
    JSON.stringify(schema)
  );
}

function describeStatus(status: number): string {
  if (status === 401) return "DEEPSEEK_API_KEY không hợp lệ (401).";
  if (status === 402) return "Tài khoản DeepSeek hết số dư (402).";
  if (status === 403) return "API key không có quyền dùng model này (403).";
  if (status === 429) return "DeepSeek API báo vượt giới hạn (429).";
  if (status >= 500) return `DeepSeek API lỗi máy chủ (${status}).`;
  return `DeepSeek API lỗi (${status}).`;
}

interface DeepSeekReply {
  model?: string;
  choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

function retryDelay(header: string | null, attempt: number): number {
  const fallback = Math.min(500 * 2 ** attempt, 8000);
  if (!header?.trim()) return fallback;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return seconds >= 0 ? seconds * 1000 : fallback;
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : fallback;
}

export function createDeepSeekAi(options: DeepSeekOptions): JsonAiCall {
  const model = options.model?.trim() || DEFAULT_DEEPSEEK_MODEL;
  const baseURL = (options.baseURL?.trim() || DEFAULT_DEEPSEEK_BASE_URL).replace(/\/+$/, "");
  const doFetch = options.fetch ?? fetch;
  const maxRetries = Math.max(0, options.maxRetries ?? 1);

  async function send(
    request: JsonAiRequest,
    signal: AbortSignal,
    attempt: number,
  ): Promise<JsonAiResult & { retryAfterMs?: number }> {
    let response: Response;
    try {
      response = await doFetch(`${baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
          model,
          stream: false,
          // DeepSeek's budget includes reasoning and the final JSON answer.
          max_tokens: 30_000,
          thinking: { type: "enabled" },
          reasoning_effort: request.effort === "low" ? "low" : "high",
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: request.system + schemaInstruction(request.schema),
            },
            { role: "user", content: request.user },
          ],
        }),
        signal,
      });
    } catch (error) {
      const name = (error as { name?: string })?.name;
      if (name === "TimeoutError" || name === "AbortError") {
        return { parsed: null, error: "DeepSeek không phản hồi kịp (timeout).", usage: null };
      }
      return { parsed: null, error: "Không kết nối được tới DeepSeek API.", usage: null };
    }

    if (!response.ok) {
      // Drain the body so the connection can be reused; never log the key.
      await response.text().catch(() => "");
      return {
        parsed: null,
        error: describeStatus(response.status),
        usage: null,
        retryAfterMs:
          response.status === 429 || (response.status >= 500 && response.status < 600)
            ? retryDelay(response.headers.get("Retry-After"), attempt)
            : undefined,
      };
    }

    let body: DeepSeekReply;
    try {
      body = (await response.json()) as DeepSeekReply;
    } catch {
      return { parsed: null, error: "DeepSeek trả về dữ liệu không đọc được.", usage: null };
    }

    const usage = {
      model: body.model?.trim() || model,
      input_tokens: body.usage?.prompt_tokens ?? 0,
      output_tokens: body.usage?.completion_tokens ?? 0,
    };
    const choice = body.choices?.[0];
    if (choice?.finish_reason === "length") {
      return { parsed: null, error: "DeepSeek dừng vì hết max_tokens — kết quả bị cắt.", usage };
    }
    if (choice?.finish_reason !== "stop") {
      return {
        parsed: null,
        error: "DeepSeek chưa hoàn tất kết quả (finish_reason không phải stop).",
        usage,
      };
    }
    const text = choice?.message?.content ?? "";
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { parsed: parsed as Record<string, unknown>, error: null, usage };
      }
    } catch {
      /* fall through */
    }
    return { parsed: null, error: "DeepSeek trả về JSON không hợp lệ.", usage };
  }

  return async (request) => {
    // Attempts and backoff share one budget; a retry never resets the timeout.
    const deadline = Date.now() + request.timeoutMs;
    const signal = AbortSignal.timeout(request.timeoutMs);
    let attempt = 0;
    for (;;) {
      const { retryAfterMs, ...result } = await send(request, signal, attempt);
      if (retryAfterMs === undefined || attempt >= maxRetries) return result;
      // If the server asks us to wait beyond the budget, keep the original error.
      if (signal.aborted || retryAfterMs >= deadline - Date.now()) return result;
      await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
      if (signal.aborted) {
        return { parsed: null, error: "DeepSeek không phản hồi kịp (timeout).", usage: null };
      }
      attempt += 1;
    }
  };
}
