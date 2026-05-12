import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type {
  ChangeRequestRow,
  ChatMessageRow,
  ChatSessionRow,
} from "@/features/copilot";

const LOCALE = z.enum(["vi", "en", "zh"]);

const chatSchema = z.object({
  session_id: z.number().int().positive().nullable().optional(),
  text: z.string().trim().min(1).max(4000),
  ui_locale: LOCALE.optional(),
});

export const chatFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => chatSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const { env } = await import("cloudflare:workers");
    const me = await requireSession("editor");

    if (!env.OPENAI_API_KEY) {
      throw new Error("Copilot chưa được kích hoạt — admin cần set OPENAI_API_KEY trên Worker.");
    }

    const { createSession, getSession, listMessages, listChangeRequestsForSession } =
      await import("@/features/copilot");
    const { chatRound } = await import("@/features/copilot/copilot.chat");

    let sessionId = data.session_id ?? null;
    if (!sessionId) {
      const newSession = await createSession(me.id);
      sessionId = newSession.id;
    } else {
      const session = await getSession(me.id, sessionId);
      if (!session) throw new Error("Session not found");
    }

    const out = await chatRound({
      apiKey: env.OPENAI_API_KEY,
      userId: me.id,
      userName: me.name,
      userRole: me.role,
      uiLocale: data.ui_locale ?? "vi",
      sessionId,
      userText: data.text,
    });

    // Return the full message list + all change requests so the client can
    // render the entire thread on first connection (cheap because tables
    // are small and indexed by session_id).
    const allMessages = await listMessages(sessionId);
    const allChangeRequests = await listChangeRequestsForSession(sessionId);

    return {
      session_id: sessionId,
      messages: allMessages,
      change_requests: allChangeRequests,
      new_message_ids: out.messages.map((m) => m.id),
      new_change_request_ids: out.pendingChangeRequestIds,
    };
  });

const decisionSchema = z.object({
  change_request_id: z.number().int().positive(),
});

export const approveChangeRequestFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => decisionSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const me = await requireSession("editor");
    const { markChangeRequestDecided } = await import("@/features/copilot");
    const { executeChangeRequest, loadOwnedChangeRequest, recordDecisionInChat } =
      await import("@/features/copilot/copilot.execute");

    const cr = await loadOwnedChangeRequest(me.id, data.change_request_id);
    if (!cr) throw new Error("Change request not found");
    if (cr.status !== "pending") throw new Error(`Change request đã ${cr.status}`);

    await markChangeRequestDecided(cr.id, "approved", me.id);
    const result = await executeChangeRequest(me.id, cr);
    await recordDecisionInChat(
      cr.session_id,
      cr.tool_call_id,
      result.ok ? "executed" : "failed",
      result.ok ? undefined : result.error,
    );
    return { ok: result.ok, error: result.error, change_request_id: cr.id };
  });

export const rejectChangeRequestFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => decisionSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const me = await requireSession("editor");
    const { markChangeRequestDecided } = await import("@/features/copilot");
    const { loadOwnedChangeRequest, recordDecisionInChat } =
      await import("@/features/copilot/copilot.execute");

    const cr = await loadOwnedChangeRequest(me.id, data.change_request_id);
    if (!cr) throw new Error("Change request not found");
    if (cr.status !== "pending") throw new Error(`Change request đã ${cr.status}`);

    await markChangeRequestDecided(cr.id, "rejected", me.id);
    await recordDecisionInChat(cr.session_id, cr.tool_call_id, "rejected", "Operator rejected");
    return { ok: true, change_request_id: cr.id };
  });

export const listSessionsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const me = await requireSession("editor");
  const { listSessions, checkBudget } = await import("@/features/copilot");
  return {
    sessions: await listSessions(me.id),
    budget: await checkBudget(me.id),
    enabled: !!(await import("cloudflare:workers")).env.OPENAI_API_KEY,
  };
});

const sessionIdSchema = z.object({ session_id: z.number().int().positive() });

export const getSessionFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => sessionIdSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const me = await requireSession("editor");
    const { getSession, listMessages, listChangeRequestsForSession } =
      await import("@/features/copilot");
    const session = await getSession(me.id, data.session_id);
    if (!session) throw new Error("Session not found");
    return {
      session,
      messages: await listMessages(session.id),
      change_requests: await listChangeRequestsForSession(session.id),
    };
  });

export const deleteSessionFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => sessionIdSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const me = await requireSession("editor");
    const { deleteSession } = await import("@/features/copilot");
    await deleteSession(me.id, data.session_id);
    return { ok: true };
  });

const renameSchema = z.object({
  session_id: z.number().int().positive(),
  title: z.string().trim().min(1).max(120),
});

export const renameSessionFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => renameSchema.parse(data))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/features/auth");
    const me = await requireSession("editor");
    const { renameSession } = await import("@/features/copilot");
    await renameSession(me.id, data.session_id, data.title);
    return { ok: true };
  });
