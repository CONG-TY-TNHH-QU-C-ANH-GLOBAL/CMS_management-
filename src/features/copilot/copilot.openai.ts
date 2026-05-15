// OpenAI Chat Completions client. Uses fetch directly (no SDK) so the
// Workers runtime doesn't pull in node deps. Function-calling format follows
// the v1/chat/completions tools spec.

import type { ChatMessageRow, MessageRole } from "./copilot.service";

/** Default endpoint. Overridable via OPENAI_BASE_URL worker secret —
 *  point at Cloudflare AI Gateway to bypass OpenAI's geo-block on
 *  Cloudflare Worker egress IPs. */
const DEFAULT_OPENAI_BASE = "https://api.openai.com/v1";
const MODEL = "gpt-4o";
const MAX_HISTORY_MESSAGES = 20;

export interface OpenAiToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    // JSON Schema describing the tool's parameters (OpenAI's expected shape)
    parameters: Record<string, unknown>;
  };
}

export interface OpenAiToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface OpenAiMessage {
  role: MessageRole;
  content: string | null;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface OpenAiResponse {
  text: string | null;
  tool_calls: OpenAiToolCall[];
  tokens_in: number;
  tokens_out: number;
}

export class OpenAiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Convert stored chat rows into the OpenAI wire format. Drops 'system' rows —
 * the system prompt is supplied fresh each call so we can edit it without
 * rewriting history.
 */
export function rowsToOpenAi(rows: ChatMessageRow[]): OpenAiMessage[] {
  return rows
    .filter((r) => r.role !== "system")
    .map((r): OpenAiMessage => {
      if (r.role === "tool") {
        return {
          role: "tool",
          content: r.content ?? "",
          tool_call_id: r.tool_call_id ?? "",
        };
      }
      if (r.role === "assistant") {
        const msg: OpenAiMessage = { role: "assistant", content: r.content };
        if (r.tool_calls_json) {
          try {
            msg.tool_calls = JSON.parse(r.tool_calls_json) as OpenAiToolCall[];
          } catch {
            /* ignore corrupt row */
          }
        }
        return msg;
      }
      return { role: "user", content: r.content ?? "" };
    });
}

/**
 * Trim history to last N messages, preserving the user→assistant→tool chain
 * integrity (don't slice off the head of a tool_calls→tool pair).
 */
export function trimHistory(messages: OpenAiMessage[], max = MAX_HISTORY_MESSAGES): OpenAiMessage[] {
  if (messages.length <= max) return messages;
  let start = messages.length - max;
  // If the slice start lands on a 'tool' message, walk back to the assistant
  // that issued the tool_call so OpenAI doesn't reject the request.
  while (start > 0 && messages[start].role === "tool") start--;
  return messages.slice(start);
}

export async function callOpenAi(
  apiKey: string,
  systemPrompt: string,
  history: OpenAiMessage[],
  tools: OpenAiToolDef[],
  baseUrl: string = DEFAULT_OPENAI_BASE,
): Promise<OpenAiResponse> {
  const messages: OpenAiMessage[] = [
    { role: "system", content: systemPrompt },
    ...trimHistory(history),
  ];

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body.error?.message) detail = body.error.message;
    } catch {
      /* ignore */
    }
    throw new OpenAiError(res.status, `OpenAI: ${detail}`);
  }

  const body = (await res.json()) as {
    choices: Array<{
      message: {
        content: string | null;
        tool_calls?: OpenAiToolCall[];
      };
    }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  const msg = body.choices[0]?.message;
  return {
    text: msg?.content ?? null,
    tool_calls: msg?.tool_calls ?? [],
    tokens_in: body.usage?.prompt_tokens ?? 0,
    tokens_out: body.usage?.completion_tokens ?? 0,
  };
}
