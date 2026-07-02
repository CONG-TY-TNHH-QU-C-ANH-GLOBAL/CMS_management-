import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, Calendar, Inbox, Mail, Tag } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { Card, PageContainer } from "@/components/cms/ui";
import {
  listCommunityQuestionsFn,
  saveCommunityExpertAnswerFn,
  updateCommunityQuestionStatusFn,
  type CommunityQuestionJoinedRow,
  type CommunityQuestionStatus,
} from "@/features/community/community.actions";

export const Route = createFileRoute("/admin/content/community/")({
  head: () => ({ meta: [{ title: "Cộng đồng (Q&A) — THG Content OS" }] }),
  loader: () => listCommunityQuestionsFn(),
  component: CommunityModerationPage,
});

const STATUS_META: Record<CommunityQuestionStatus, { label: string; color: string }> = {
  pending: { label: "Chờ duyệt", color: "bg-amber-100 text-amber-800 border-amber-300" },
  published: { label: "Đã đăng", color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  rejected: { label: "Từ chối", color: "bg-rose-100 text-rose-800 border-rose-300" },
};

function formatTime(seconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - seconds;
  if (diff < 60) return "vừa xong";
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  return new Date(seconds * 1000).toLocaleString("vi-VN");
}

function CommunityModerationPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const updateStatus = useServerFn(updateCommunityQuestionStatusFn);
  const saveAnswer = useServerFn(saveCommunityExpertAnswerFn);
  const [filter, setFilter] = useState<"all" | CommunityQuestionStatus>("pending");
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftAnswer, setDraftAnswer] = useState("");
  const [draftVerified, setDraftVerified] = useState(false);

  const all = data.questions as CommunityQuestionJoinedRow[];
  const counts = useMemo(() => {
    const c = { all: all.length, pending: 0, published: 0, rejected: 0 };
    for (const q of all) c[q.status]++;
    return c;
  }, [all]);

  const filtered = filter === "all" ? all : all.filter((q) => q.status === filter);

  async function setStatus(id: number, status: CommunityQuestionStatus) {
    setPendingId(id);
    try {
      await updateStatus({ data: { id, status } });
      toast.success(`Đã đổi trạng thái → ${STATUS_META[status].label}`);
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Đổi trạng thái thất bại");
    } finally {
      setPendingId(null);
    }
  }

  function openAnswerEditor(q: CommunityQuestionJoinedRow) {
    setEditingId(q.id);
    setDraftAnswer(q.expert_answer ?? "");
    setDraftVerified(q.verified === 1);
  }

  async function submitAnswer(id: number) {
    setPendingId(id);
    try {
      await saveAnswer({
        data: { id, expert_answer: draftAnswer.trim() || null, verified: draftVerified },
      });
      toast.success("Đã lưu câu trả lời chuyên gia");
      setEditingId(null);
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <>
      <CmsTopbar
        title="Cộng đồng (Q&A) — kiểm duyệt"
        subtitle={`${counts.all} tổng · ${counts.pending} chờ duyệt`}
      />
      <PageContainer>
        <div className="flex flex-wrap gap-2 mb-4">
          {([
            { key: "pending", label: `Chờ duyệt (${counts.pending})` },
            { key: "published", label: `Đã đăng (${counts.published})` },
            { key: "rejected", label: `Từ chối (${counts.rejected})` },
            { key: "all", label: `Tất cả (${counts.all})` },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`h-9 px-3 rounded-lg text-sm font-medium transition ${
                filter === t.key
                  ? "bg-foreground text-background"
                  : "border border-border bg-surface text-foreground hover:bg-surface-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <Card>
          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 mx-auto rounded-full bg-muted grid place-items-center mb-3">
                <Inbox className="w-5 h-5 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-sm mb-1">Không có câu hỏi nào ở filter này</h3>
              <p className="text-xs text-muted-foreground">
                Câu hỏi mới xuất hiện khi seller submit trên landing (POST
                /api/v1/community/questions) — mặc định "Chờ duyệt".
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((q) => {
                const meta = STATUS_META[q.status];
                return (
                  <li key={q.id} className="p-4 hover:bg-surface-muted transition">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{q.title}</span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${meta.color}`}>
                            {meta.label}
                          </span>
                          {q.verified === 1 && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-sky-100 text-sky-800 border-sky-300">
                              <BadgeCheck className="w-3 h-3" /> Verified
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                          <span>{q.author_name}</span>
                          <span className="inline-flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            <a href={`mailto:${q.author_email}`} className="hover:text-foreground">
                              {q.author_email}
                            </a>
                          </span>
                          {q.category_name && (
                            <span className="inline-flex items-center gap-1">
                              <Tag className="w-3 h-3" />
                              {q.category_name}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatTime(q.created_at)}
                          </span>
                          <span>👥 {q.same_issue_count} same issue</span>
                        </div>
                        <div className="mt-2 text-sm text-foreground/80 leading-relaxed border-l-2 border-border pl-3 whitespace-pre-wrap">
                          {q.body}
                        </div>

                        {editingId === q.id ? (
                          <div className="mt-3 space-y-2">
                            <textarea
                              value={draftAnswer}
                              onChange={(e) => setDraftAnswer(e.target.value)}
                              rows={5}
                              placeholder="Câu trả lời chính thức của chuyên gia THG (markdown)…"
                              className="w-full text-sm rounded-md border border-border bg-background p-2"
                            />
                            <label className="flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={draftVerified}
                                onChange={(e) => setDraftVerified(e.target.checked)}
                              />
                              Đánh dấu "Verified by THG" (cho phép Google index)
                            </label>
                            <div className="flex gap-2">
                              <button
                                onClick={() => submitAnswer(q.id)}
                                disabled={pendingId === q.id}
                                className="h-8 px-3 text-xs font-medium rounded-md bg-foreground text-background disabled:opacity-50"
                              >
                                Lưu
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="h-8 px-3 text-xs rounded-md border border-border"
                              >
                                Hủy
                              </button>
                            </div>
                          </div>
                        ) : (
                          q.expert_answer && (
                            <div className="mt-2 text-sm leading-relaxed border-l-2 border-emerald-400 pl-3 whitespace-pre-wrap">
                              <span className="text-[10px] font-semibold text-emerald-700 block mb-1">
                                THG EXPERT ANSWER
                              </span>
                              {q.expert_answer}
                            </div>
                          )
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <select
                          value={q.status}
                          onChange={(e) => setStatus(q.id, e.target.value as CommunityQuestionStatus)}
                          disabled={pendingId === q.id}
                          className="h-8 px-2 text-xs rounded-md border border-border bg-background disabled:opacity-50"
                        >
                          {(Object.keys(STATUS_META) as CommunityQuestionStatus[]).map((s) => (
                            <option key={s} value={s}>{STATUS_META[s].label}</option>
                          ))}
                        </select>
                        {editingId !== q.id && (
                          <button
                            onClick={() => openAnswerEditor(q)}
                            className="h-8 px-2 text-xs rounded-md border border-border hover:bg-surface-muted"
                          >
                            {q.expert_answer ? "Sửa trả lời" : "Trả lời (Expert)"}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </PageContainer>
    </>
  );
}
