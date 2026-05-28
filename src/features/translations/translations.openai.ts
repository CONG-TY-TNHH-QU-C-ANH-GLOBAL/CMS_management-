// IMPURE: OpenAI Chat Completions wrapper for translation jobs. Uses direct
// fetch (no SDK) so the Cloudflare Workers runtime stays small. Implements
// the malformed-JSON recovery flow from spec §4.3:
//   - First attempt
//   - If parse fails → 1 retry with stricter prompt
//   - Both raw responses preserved for forensics

import { tryParseJson } from "./translations.structural";
import { buildRetryMessage, type PromptMessage } from "./translations.prompt";

/** Default OpenAI Chat Completions endpoint. Overridable via the
 *  OPENAI_BASE_URL worker secret — point at Cloudflare AI Gateway
 *  (https://gateway.ai.cloudflare.com/v1/{account}/{gateway}/openai)
 *  if direct api.openai.com calls hit geo-blocked egress IPs from
 *  Cloudflare Workers. */
const DEFAULT_OPENAI_BASE = "https://api.openai.com/v1";
/** Timeout per OpenAI call. gpt-4o-mini usually returns in 2-4s, but a large
 *  careers JD (10 fields incl. heavy JSON) can take much longer; 60s avoids
 *  false timeouts on big entities. Combine with one-locale-per-call upstream
 *  to keep payloads small. */
const TIMEOUT_MS = 60_000;

/** Transient-failure retry (429 rate-limit, 5xx, network/abort). Exponential
 *  backoff with jitter — mirrors the shipping plain-markdown translator so a
 *  single rate-limited call no longer fails the whole translation. */
const MAX_TRANSIENT_ATTEMPTS = 3;

function isTransient(err: unknown): boolean {
  if (err instanceof OpenAiApiError) {
    return err.status === 429 || err.status === 408 || (err.status >= 500 && err.status < 600);
  }
  // AbortError (timeout) + network errors are transient.
  return true;
}

export interface OpenAiCallResult {
  /** Raw assistant message content. Captured even when parsing fails. */
  rawText: string;
  tokensIn: number;
  tokensOut: number;
}

export class OpenAiApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "OpenAiApiError";
  }
}

async function callOnce(
  apiKey: string,
  model: string,
  messages: PromptMessage[],
  baseUrl: string,
): Promise<OpenAiCallResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        // Lower temperature for translation — we want consistent output, not creativity.
        temperature: 0.2,
        // response_format json_object increases JSON adherence rate substantially.
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      let detail = `${res.status} ${res.statusText}`;
      try {
        const body = (await res.json()) as { error?: { message?: string } };
        if (body.error?.message) detail = body.error.message;
      } catch {
        /* ignore */
      }
      throw new OpenAiApiError(res.status, `OpenAI: ${detail}`);
    }
    const body = (await res.json()) as {
      choices: Array<{ message: { content: string | null } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    return {
      rawText: body.choices[0]?.message?.content ?? "",
      tokensIn: body.usage?.prompt_tokens ?? 0,
      tokensOut: body.usage?.completion_tokens ?? 0,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** callOnce + exponential-backoff retry on transient failures. */
async function callOnceWithRetry(
  apiKey: string,
  model: string,
  messages: PromptMessage[],
  baseUrl: string,
): Promise<OpenAiCallResult> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_TRANSIENT_ATTEMPTS; attempt++) {
    try {
      return await callOnce(apiKey, model, messages, baseUrl);
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || attempt === MAX_TRANSIENT_ATTEMPTS - 1) break;
      const delay = 1200 * Math.pow(2, attempt) + Math.floor(Math.random() * 600);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export interface RecoveryResult {
  /** Raw response(s) joined by "---RETRY---" if a retry happened. Always present. */
  rawResponse: string;
  /** Parsed JSON object, or null if both attempts failed. */
  parsed: Record<string, unknown> | null;
  /** 1 or 2 — how many OpenAI round-trips we made. */
  parseAttempts: number;
  /** Sum of both attempts when retried. */
  tokensIn: number;
  tokensOut: number;
  /** Network / 5xx / quota errors land here. null when call succeeded
   *  (even if JSON didn't parse — that's a parse_error, not api_error). */
  apiError: OpenAiApiError | Error | null;
}

/** Call OpenAI with malformed-JSON recovery. Per spec §4.3.
 *  - First attempt.
 *  - If parse fails AND no api error → 1 retry with stricter prompt.
 *  - Either way return raw response(s) for forensic logging.
 *
 *  `baseUrl` defaults to api.openai.com but the caller can override with the
 *  OPENAI_BASE_URL worker secret (e.g. Cloudflare AI Gateway proxy URL). */
export async function callOpenAiWithJsonRecovery(
  apiKey: string,
  model: string,
  messages: PromptMessage[],
  baseUrl: string = DEFAULT_OPENAI_BASE,
): Promise<RecoveryResult> {
  let first: OpenAiCallResult;
  try {
    first = await callOnceWithRetry(apiKey, model, messages, baseUrl);
  } catch (err) {
    return {
      rawResponse: "",
      parsed: null,
      parseAttempts: 1,
      tokensIn: 0,
      tokensOut: 0,
      apiError: err as Error,
    };
  }
  const parsedFirst = tryParseJson(first.rawText);
  if (parsedFirst) {
    return {
      rawResponse: first.rawText,
      parsed: parsedFirst,
      parseAttempts: 1,
      tokensIn: first.tokensIn,
      tokensOut: first.tokensOut,
      apiError: null,
    };
  }

  // Retry once with stricter prompt.
  const retryMessages = [...messages, ...buildRetryMessage(first.rawText)];
  let second: OpenAiCallResult;
  try {
    second = await callOnceWithRetry(apiKey, model, retryMessages, baseUrl);
  } catch (err) {
    return {
      rawResponse: first.rawText + "\n---RETRY-API-ERROR---\n",
      parsed: null,
      parseAttempts: 2,
      tokensIn: first.tokensIn,
      tokensOut: first.tokensOut,
      apiError: err as Error,
    };
  }
  const parsedSecond = tryParseJson(second.rawText);
  return {
    rawResponse: first.rawText + "\n---RETRY---\n" + second.rawText,
    parsed: parsedSecond,
    parseAttempts: 2,
    tokensIn: first.tokensIn + second.tokensIn,
    tokensOut: first.tokensOut + second.tokensOut,
    apiError: null,
  };
}
