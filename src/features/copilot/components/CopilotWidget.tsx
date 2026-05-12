// Floating Copilot launcher + drawer. Mounted in __root.tsx alongside the
// CommandPalette so it appears on every /admin/* page. Disabled (button
// grayed) when OPENAI_API_KEY isn't configured server-side.

import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Loader2, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import {
  chatFn,
  approveChangeRequestFn,
  rejectChangeRequestFn,
  listSessionsFn,
  type ChangeRequestRow,
  type ChatMessageRow,
} from "@/features/copilot/copilot.actions";
import { ChatMessage } from "./ChatMessage";
import { ChangeRequestCard } from "./ChangeRequestCard";

interface ChatState {
  sessionId: number | null;
  messages: ChatMessageRow[];
  changeRequests: ChangeRequestRow[];
}

export function CopilotWidget() {
  const [open, setOpen] = useState(false);
  const [chat, setChat] = useState<ChatState>({ sessionId: null, messages: [], changeRequests: [] });
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [budget, setBudget] = useState<{ used_in: number; limit_in: number } | null>(null);
  const sendChat = useServerFn(chatFn);
  const approve = useServerFn(approveChangeRequestFn);
  const reject = useServerFn(rejectChangeRequestFn);
  const listSessions = useServerFn(listSessionsFn);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Lazy-load enabled status + recent session on first open
  useEffect(() => {
    if (!open || enabled !== null) return;
    listSessions()
      .then((res) => {
        setEnabled(res.enabled);
        setBudget({ used_in: res.budget.used_in, limit_in: res.budget.limit_in });
      })
      .catch(() => setEnabled(false));
  }, [open, enabled, listSessions]);

  // Auto-scroll on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chat.messages.length, chat.changeRequests.length]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || pending) return;
    const text = draft.trim();
    setDraft("");
    setPending(true);

    // Optimistic user message
    const optimistic: ChatMessageRow = {
      id: -Date.now(),
      session_id: chat.sessionId ?? 0,
      role: "user",
      content: text,
      tool_calls_json: null,
      tool_call_id: null,
      tokens_in: null,
      tokens_out: null,
      created_at: Math.floor(Date.now() / 1000),
    };
    setChat((c) => ({ ...c, messages: [...c.messages, optimistic] }));

    try {
      const out = await sendChat({
        data: { session_id: chat.sessionId, text, ui_locale: "vi" },
      });
      setChat({
        sessionId: out.session_id,
        messages: out.messages,
        changeRequests: out.change_requests,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gửi thất bại");
      // Roll back optimistic message
      setChat((c) => ({ ...c, messages: c.messages.filter((m) => m.id !== optimistic.id) }));
    } finally {
      setPending(false);
    }
  }

  async function handleApprove(id: number) {
    try {
      const result = await approve({ data: { change_request_id: id } });
      if (result.ok) {
        toast.success("Đã áp dụng thay đổi vào website");
      } else {
        toast.error(`Áp dụng thất bại: ${result.error}`);
      }
      // Re-mark locally
      setChat((c) => ({
        ...c,
        changeRequests: c.changeRequests.map((cr) =>
          cr.id === id
            ? {
                ...cr,
                status: result.ok ? "executed" : "failed",
                error_message: result.error ?? null,
                decided_at: Math.floor(Date.now() / 1000),
              }
            : cr,
        ),
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approve thất bại");
    }
  }

  async function handleReject(id: number) {
    try {
      await reject({ data: { change_request_id: id } });
      setChat((c) => ({
        ...c,
        changeRequests: c.changeRequests.map((cr) =>
          cr.id === id
            ? { ...cr, status: "rejected", decided_at: Math.floor(Date.now() / 1000) }
            : cr,
        ),
      }));
      toast.info("Đã từ chối — Copilot có thể đề xuất lại.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reject thất bại");
    }
  }

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Mở Copilot"
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 h-12 px-4 rounded-full bg-foreground text-background shadow-elevated hover:scale-105 transition-transform"
        >
          <Sparkles className="w-5 h-5" />
          <span className="text-sm font-semibold pr-1">Copilot</span>
        </button>
      )}

      {/* Drawer */}
      {open && (
        <div className="fixed bottom-0 right-0 z-50 w-full sm:w-[440px] h-[80vh] sm:h-[640px] sm:bottom-5 sm:right-5 sm:rounded-2xl bg-background border border-border shadow-elevated flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-muted/50">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-foreground text-background grid place-items-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold leading-tight">THG Copilot</div>
                <div className="text-[10px] text-muted-foreground leading-tight">
                  {budget
                    ? `${budget.used_in.toLocaleString()} / ${budget.limit_in.toLocaleString()} token`
                    : "Đang tải…"}
                </div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Đóng Copilot"
              className="p-1.5 rounded-md hover:bg-surface-muted text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {enabled === false && (
              <div className="text-sm text-muted-foreground bg-amber-50 border border-amber-200 rounded-md p-3">
                Copilot chưa được kích hoạt. Admin cần set <code className="font-mono text-xs bg-white px-1 rounded">OPENAI_API_KEY</code> trên Worker (lệnh: <code className="font-mono text-xs bg-white px-1 rounded">bunx wrangler secret put OPENAI_API_KEY</code>).
              </div>
            )}
            {enabled !== false && chat.messages.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-12">
                <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-40" />
                <div className="font-medium text-foreground mb-1">Chào! Mình là Copilot.</div>
                <div className="text-xs">Thử yêu cầu mình:</div>
                <ul className="text-xs mt-3 space-y-1.5 max-w-xs mx-auto text-left">
                  <li>• "Sửa hero subtitle thành Y"</li>
                  <li>• "Thêm 1 FAQ về thời gian giao Mỹ"</li>
                  <li>• "Đổi testimonial 2 thành 5 sao"</li>
                  <li>• "Đổi tên brand thành Z"</li>
                </ul>
              </div>
            )}
            {chat.messages.map((m) => (
              <div key={m.id}>
                <ChatMessage message={m} />
                {/* Render any change_requests that came from this assistant message */}
                {m.role === "assistant" &&
                  chat.changeRequests
                    .filter((cr) => cr.message_id === m.id)
                    .map((cr) => (
                      <div key={cr.id} className="mt-2">
                        <ChangeRequestCard
                          request={cr}
                          onApprove={() => handleApprove(cr.id)}
                          onReject={() => handleReject(cr.id)}
                        />
                      </div>
                    ))}
              </div>
            ))}
            {pending && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Copilot đang suy nghĩ…
              </div>
            )}
          </div>

          <form onSubmit={handleSend} className="border-t border-border p-3 flex gap-2 bg-surface-muted/30">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Mô tả thay đổi bằng tiếng Việt…"
              disabled={pending || enabled === false}
              className="flex-1 h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!draft.trim() || pending || enabled === false}
              className="h-10 w-10 rounded-lg bg-foreground text-background grid place-items-center hover:opacity-90 disabled:opacity-30"
              aria-label="Gửi"
            >
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
