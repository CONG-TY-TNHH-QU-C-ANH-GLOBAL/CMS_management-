import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { FileLock2, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { Card, PageContainer } from "@/components/cms/ui";
import {
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
  listCommunityReviewsFn,
  saveCommunityReviewModerationFn,
  updateCommunityReviewStatusFn,
  type CommunityReviewJoinedRow,
} from "@/features/community/community.actions";

export const Route = createFileRoute("/admin/content/community/reviews/")({
  head: () => ({ meta: [{ title: "Cộng đồng (Đánh giá) — THG Content OS" }] }),
  loader: () => listCommunityReviewsFn(),
  component: CommunityReviewsModerationPage,
});

function CommunityReviewsModerationPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const updateStatus = useServerFn(updateCommunityReviewStatusFn);
  const saveModeration = useServerFn(saveCommunityReviewModerationFn);
  const [filter, setFilter] = useState<"all" | ModerationStatus>("pending");
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftSummary, setDraftSummary] = useState("");
  const [draftVerified, setDraftVerified] = useState(false);

  const all = data.reviews as CommunityReviewJoinedRow[];
  const counts = useMemo(() => tallyStatuses(all), [all]);
  const filtered = filter === "all" ? all : all.filter((r) => r.status === filter);

  async function setStatus(id: number, status: ModerationStatus) {
    setPendingId(id);
    try {
      await updateStatus({ data: { id, status } });
      toast.success("Đã đổi trạng thái");
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Đổi trạng thái thất bại");
    } finally {
      setPendingId(null);
    }
  }

  function openModerationEditor(r: CommunityReviewJoinedRow) {
    setEditingId(r.id);
    setDraftSummary(r.public_summary ?? "");
    setDraftVerified(r.verified === 1);
  }

  async function submitModeration(id: number) {
    setPendingId(id);
    try {
      await saveModeration({
        data: { id, public_summary: draftSummary.trim() || null, verified: draftVerified },
      });
      toast.success("Đã lưu kiểm duyệt đánh giá");
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
        title="Cộng đồng (Đánh giá) — kiểm duyệt"
        subtitle={`${counts.all} tổng · ${counts.pending} chờ duyệt`}
      />
      <PageContainer>
        <ModerationTabs counts={counts} filter={filter} onFilter={setFilter} />

        <Card>
          {filtered.length === 0 ? (
            <ModerationEmpty title="Không có đánh giá nào ở filter này">
              Đánh giá mới xuất hiện khi seller submit trên landing (POST
              /api/v1/community/reviews) — mặc định "Chờ duyệt". Chỉ hiển thị
              công khai khi Đã đăng + "Verified by THG".
            </ModerationEmpty>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((r) => (
                <li key={r.id} className="p-4 hover:bg-surface-muted transition">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{r.title}</span>
                        <ModerationStatusBadge status={r.status} />
                        {r.verified === 1 && <VerifiedBadge />}
                        {r.rating != null && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {r.rating}/5
                          </span>
                        )}
                      </div>
                      <ModerationMetaRow
                        name={r.reviewer_name}
                        email={r.reviewer_email}
                        categoryName={r.category_name}
                        createdAt={r.created_at}
                      />
                      <div className="mt-2 text-sm text-foreground/80 leading-relaxed border-l-2 border-border pl-3 whitespace-pre-wrap">
                        {r.body}
                      </div>

                      {/* Admin-only private evidence — NEVER sent to the public API. */}
                      {(r.private_evidence_note || r.private_order_reference) && (
                        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50/60 p-2 text-xs text-amber-900">
                          <span className="inline-flex items-center gap-1 font-semibold text-[10px] uppercase tracking-wide">
                            <FileLock2 className="w-3 h-3" /> Riêng tư (chỉ admin)
                          </span>
                          {r.private_order_reference && (
                            <div className="mt-1">Mã đơn: {r.private_order_reference}</div>
                          )}
                          {r.private_evidence_note && (
                            <div className="mt-1 whitespace-pre-wrap">{r.private_evidence_note}</div>
                          )}
                        </div>
                      )}

                      {editingId === r.id ? (
                        <div className="mt-3 space-y-2">
                          <textarea
                            value={draftSummary}
                            onChange={(e) => setDraftSummary(e.target.value)}
                            rows={3}
                            placeholder="Tóm tắt công khai (tuỳ chọn) — hiển thị phía trên nội dung đánh giá…"
                            className="w-full text-sm rounded-md border border-border bg-background p-2"
                          />
                          <label className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={draftVerified}
                              onChange={(e) => setDraftVerified(e.target.checked)}
                            />
                            <span>
                              Đánh dấu "Verified by THG" — chỉ khi Đã đăng + Verified thì trang mới được Google index
                            </span>
                          </label>
                          <div className="flex gap-2">
                            <button
                              onClick={() => submitModeration(r.id)}
                              disabled={pendingId === r.id}
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
                        r.public_summary && (
                          <div className="mt-2 text-sm leading-relaxed border-l-2 border-emerald-400 pl-3 whitespace-pre-wrap">
                            <span className="text-[10px] font-semibold text-emerald-700 block mb-1">
                              TÓM TẮT CÔNG KHAI
                            </span>
                            {r.public_summary}
                          </div>
                        )
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <ModerationStatusSelect
                        value={r.status}
                        disabled={pendingId === r.id}
                        onChange={(s) => setStatus(r.id, s)}
                      />
                      {editingId !== r.id && (
                        <button
                          onClick={() => openModerationEditor(r)}
                          className="h-8 px-2 text-xs rounded-md border border-border hover:bg-surface-muted"
                        >
                          Kiểm duyệt
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
