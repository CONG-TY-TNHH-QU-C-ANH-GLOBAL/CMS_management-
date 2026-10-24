// The one AI boundary for landing uploads: Claude through the official
// Anthropic SDK, one structured-output (JSON schema) request per step.
//
// Request shape (both steps):
//   client.beta.messages.create({
//     model,                                  // LANDING_AI_MODEL, default claude-opus-5-5
//     max_tokens,
//     system, messages: [{ role: "user", ... }],  // no assistant prefill
//     output_config: { effort, format: { type: "json_schema", schema } },
//     betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
//   })
// No `thinking` field (adaptive is the default on Opus 5.5 and disabling it is
// a 400) and no sampling parameters. stop_reason is checked (refusal,
// max_tokens) before content is read. Every failure becomes a reason string;
// the callers then fall back to the deterministic path. The API key is never
// logged or included in a reason.

import Anthropic from "@anthropic-ai/sdk";

import type { AiUsageSummary } from "./landing.types";

export const DEFAULT_LANDING_AI_MODEL = "claude-opus-5-5";
/** Server-side refusal fallback, routed by refusal category. */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export type AiEffort = "low" | "medium" | "high";

export interface JsonAiRequest {
  system: string;
  user: string;
  /** JSON schema for output_config.format (all properties required, no extras). */
  schema: Record<string, unknown>;
  effort: AiEffort;
  maxTokens: number;
  /** Per-request timeout in ms. */
  timeoutMs: number;
}

export type AiUsage = AiUsageSummary;

export interface JsonAiResult {
  parsed: Record<string, unknown> | null;
  /** Why `parsed` is null; never contains the API key. */
  error: string | null;
  usage: AiUsage | null;
}

/** The seam the format and audit steps depend on. */
export type JsonAiCall = (request: JsonAiRequest) => Promise<JsonAiResult>;

export interface LandingAiOptions {
  apiKey: string;
  model?: string;
  baseURL?: string;
  /** Low on purpose: a Worker request should not spend minutes retrying. */
  maxRetries?: number;
  /** Test hook: the SDK's fetch. */
  fetch?: typeof fetch;
}

/** Reason text for an SDK error. Most specific first (APIConnectionTimeoutError extends
 *  APIConnectionError, which extends APIError in the TS SDK). */
export function describeAiError(error: unknown): string {
  if (error instanceof Anthropic.APIConnectionTimeoutError)
    return "Claude không phản hồi kịp (timeout).";
  if (error instanceof Anthropic.APIConnectionError) return "Không kết nối được tới Claude API.";
  if (error instanceof Anthropic.RateLimitError) return "Claude API báo vượt giới hạn (429).";
  if (error instanceof Anthropic.AuthenticationError)
    return "ANTHROPIC_API_KEY không hợp lệ (401).";
  if (error instanceof Anthropic.PermissionDeniedError)
    return "API key không có quyền dùng model này (403).";
  if (error instanceof Anthropic.BadRequestError) return "Claude API từ chối yêu cầu (400).";
  if (error instanceof Anthropic.InternalServerError) {
    return `Claude API lỗi máy chủ (${error.status}).`;
  }
  if (error instanceof Anthropic.APIError) return `Claude API lỗi (${error.status ?? "?"}).`;
  return "Lỗi không xác định khi gọi Claude.";
}

export function createLandingAi(options: LandingAiOptions): JsonAiCall {
  const model = options.model?.trim() || DEFAULT_LANDING_AI_MODEL;
  const client = new Anthropic({
    apiKey: options.apiKey,
    baseURL: options.baseURL,
    maxRetries: options.maxRetries ?? 1,
    fetch: options.fetch,
  });

  return async (request) => {
    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await client.beta.messages.create(
        {
          model,
          max_tokens: request.maxTokens,
          system: request.system,
          messages: [{ role: "user", content: request.user }],
          output_config: {
            effort: request.effort,
            format: { type: "json_schema", schema: request.schema },
          },
          betas: [FALLBACK_BETA],
          fallbacks: "default",
        },
        { timeout: request.timeoutMs },
      );
    } catch (error) {
      console.error("[landing-ai] request failed:", describeAiError(error));
      return { parsed: null, error: describeAiError(error), usage: null };
    }

    const usage: AiUsage = {
      model: message.model,
      input_tokens: message.usage.input_tokens,
      output_tokens: message.usage.output_tokens,
    };
    if (message.stop_reason === "refusal") {
      const category = message.stop_details?.category;
      return {
        parsed: null,
        error: `Claude từ chối xử lý (refusal${category ? `: ${category}` : ""}).`,
        usage,
      };
    }
    if (message.stop_reason === "max_tokens") {
      return { parsed: null, error: "Claude dừng vì hết max_tokens — kết quả bị cắt.", usage };
    }
    const text = message.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { parsed: parsed as Record<string, unknown>, error: null, usage };
      }
    } catch {
      /* fall through */
    }
    return { parsed: null, error: "Claude trả về JSON không hợp lệ.", usage };
  };
}
