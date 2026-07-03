import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { Card, PageContainer } from "@/components/cms/ui";
import {
  MODERATION_STATUS_META,
  ModerationEmpty,
  ModerationMetaRow,
  ModerationStatusBadge,
  ModerationStatusSelect,
  ModerationTabs,
  tallyStatuses,
  VerifiedBadge,
  type ModerationStatus,
} from "@/components/cms/moderation";
import {
  listCommunityQuestionsFn,
  saveCommunityExpertAnswerFn,
  updateCommunityQuestionStatusFn,
  type CommunityQuestionJoinedRow,
} from "@/features/community/community.actions";

export const Route = createFileRoute("/admin/content/community/")({
  head: () => ({ meta: [{ title: "Cộng đồng (Q&A) — THG Content OS" }] }),
  loader: () => listCommunityQuestionsFn(),
  component: CommunityModerationPage,
});

function CommunityModerationPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const updateStatus = useServerFn(updateCommunityQuestionStatusFn);
  const saveAnswer = useServerFn(saveCommunityExpertAnswerFn);
  const [filter, setFilter] = useState<"all" | ModerationStatus>("pending");
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftAnswer, setDraftAnswer] = useState("");
  const [draftVerified, setDraftVerified] = useState(false);

  const all = data.questions as CommunityQuestionJoinedRow[];
  const counts = useMemo(() => tallyStatuses(all), [all]);
  const filtered = filter === "all" ? all : all.filter((q) => q.status === filter);

  async function setStatus(id: number, status: ModerationStatus) {
    setPendingId(id);
    try {
      await updateStatus({ data: { id, status } });
      toast.success(`Đã đổi trạng thái → ${MODERATION_STATUS_META[status].label}`);
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
        <ModerationTabs counts={counts} filter={filter} onFilter={setFilter} />

        <Card>
          {filtered.length === 0 ? (
            <ModerationEmpty title="Không có câu hỏi nào ở filter này">
              Câu hỏi mới xuất hiện khi seller submit trên landing (POST
              /api/v1/community/questions) — mặc định "Chờ duyệt".
            </ModerationEmpty>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((q) => (
                <li key={q.id} className="p-4 hover:bg-surface-muted transition">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{q.title}</span>
                        <ModerationStatusBadge status={q.status} />
                        {q.verified === 1 && <VerifiedBadge />}
                      </div>
                      <ModerationMetaRow
                        name={q.author_name}
                        email={q.author_email}
                        categoryName={q.category_name}
                        createdAt={q.created_at}
                      >
                        <span>👥 {q.same_issue_count} same issue</span>
                      </ModerationMetaRow>
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
                            <span>
                              Đánh dấu "Verified by THG" — bắt buộc có câu trả lời chuyên gia; chỉ khi đó trang mới được Google index
                            </span>
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
                      <ModerationStatusSelect
                        value={q.status}
                        disabled={pendingId === q.id}
                        onChange={(s) => setStatus(q.id, s)}
                      />
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
              ))}
            </ul>
          )}
        </Card>
      </PageContainer>
    </>
  );
}
