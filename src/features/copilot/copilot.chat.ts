// chat() — orchestrates one round of: append user message → call OpenAI →
// dispatch each tool_call → optionally re-call OpenAI with tool results →
// persist assistant message. Returns the new messages + any pending changes.

import {
  appendMessage,
  checkBudget,
  getSession,
  listMessages,
  recordUsage,
  touchSession,
  type ChangeRequestRow,
  type ChatMessageRow,
} from "./copilot.service";
import {
  buildToolDefs,
  dispatchToolCall,
  isProposeTool,
} from "./copilot.tools";
import {
  callOpenAi,
  rowsToOpenAi,
  type OpenAiMessage,
  type OpenAiToolCall,
} from "./copilot.openai";
import { buildSystemPrompt } from "./copilot.system-prompt";

export interface ChatRoundInput {
  apiKey: string;
  userId: number;
  userName: string;
  userRole: "admin" | "editor" | "viewer";
  uiLocale: "vi" | "en" | "zh";
  sessionId: number;
  userText: string;
}

export interface ChatRoundOutput {
  messages: ChatMessageRow[];          // newly appended messages this round
  pendingChangeRequestIds: number[];   // ai_change_requests rows created
}

const MAX_TOOL_LOOPS = 3;

export async function chatRound(input: ChatRoundInput): Promise<ChatRoundOutput> {
  // 1. Verify session ownership
  const session = await getSession(input.userId, input.sessionId);
  if (!session) throw new Error("Session not found");

  // 2. Budget gate
  const budget = await checkBudget(input.userId);
  if (!budget.allowed) {
    throw new Error(
      `Đã hết quota AI hôm nay (${budget.used_in}/${budget.limit_in} input, ${budget.used_out}/${budget.limit_out} output). Reset 00:00 UTC.`,
    );
  }

  // 3. Persist the user message
  const userMsg = await appendMessage({
    session_id: input.sessionId,
    role: "user",
    content: input.userText,
  });

  const newMessages: ChatMessageRow[] = [userMsg];
  const pendingIds: number[] = [];

  // 4. Build context: full history → OpenAI format
  const systemPrompt = buildSystemPrompt({
    operatorName: input.userName,
    operatorRole: input.userRole,
    uiLocale: input.uiLocale,
    todayIso: new Date().toISOString().slice(0, 10),
  });
  const tools = buildToolDefs();

  // 5. Tool-loop: keep going until model returns text-only or hits max loops
  for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
    const history = await listMessages(input.sessionId);
    const openAiHistory = rowsToOpenAi(history);

    const resp = await callOpenAi(input.apiKey, systemPrompt, openAiHistory, tools);
    await recordUsage(input.userId, resp.tokens_in, resp.tokens_out);

    // Persist assistant message (text + any tool_calls)
    const assistantMsg = await appendMessage({
      session_id: input.sessionId,
      role: "assistant",
      content: resp.text,
      tool_calls_json: resp.tool_calls.length > 0 ? JSON.stringify(resp.tool_calls) : null,
      tokens_in: resp.tokens_in,
      tokens_out: resp.tokens_out,
    });
    newMessages.push(assistantMsg);

    if (resp.tool_calls.length === 0) break;

    // Dispatch each tool_call serially. Order matters because some calls
    // (read → propose) feed each other via the model's reasoning later.
    for (const call of resp.tool_calls) {
      const result = await dispatchToolCall({
        userId: input.userId,
        sessionId: input.sessionId,
        message: assistantMsg,
        toolCall: call,
      });
      const toolMsg = await appendMessage({
        session_id: input.sessionId,
        role: "tool",
        content: result.output,
        tool_call_id: call.id,
      });
      newMessages.push(toolMsg);
      if (result.changeRequestId) pendingIds.push(result.changeRequestId);
    }

    // If all tool_calls were propose_*, we don't need another model round —
    // the model already explained its proposal in the assistant text. Cuts
    // a token-heavy round trip per write op.
    const allPropose = resp.tool_calls.every((c) => isProposeTool(c.function.name));
    if (allPropose) break;
  }

  await touchSession(input.sessionId);
  return { messages: newMessages, pendingChangeRequestIds: pendingIds };
}

export interface PendingChangeBundle {
  request: ChangeRequestRow;
  preview: { before: unknown; after: unknown; summary: string } | null;
}

export function bundleChangeRequest(row: ChangeRequestRow): PendingChangeBundle {
  let preview: PendingChangeBundle["preview"] = null;
  if (row.preview_json) {
    try {
      preview = JSON.parse(row.preview_json);
    } catch {
      /* ignore */
    }
  }
  return { request: row, preview };
}
