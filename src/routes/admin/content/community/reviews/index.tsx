import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, Calendar, FileLock2, Inbox, Mail, Star, Tag } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { Card, PageContainer } from "@/components/cms/ui";
import {
  listCommunityReviewsFn,
  saveCommunityReviewModerationFn,
  updateCommunityReviewStatusFn,
  type CommunityReviewJoinedRow,
  type CommunityReviewStatus,
} from "@/features/community/community.actions";

export const Route = createFileRoute("/admin/content/community/reviews/")({
  head: () => ({ meta: [{ title: "Cộng đồng (Đánh giá) — THG Content OS" }] }),
  loader: () => listCommunityReviewsFn(),
  component: CommunityReviewsModerationPage,
});

const STATUS_META: Record<CommunityReviewStatus, { label: string; color: string }> = {
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

function CommunityReviewsModerationPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const updateStatus = useServerFn(updateCommunityReviewStatusFn);
  const saveModeration = useServerFn(saveCommunityReviewModerationFn);
  const [filter, setFilter] = useState<"all" | CommunityReviewStatus>("pending");
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftSummary, setDraftSummary] = useState("");
  const [draftVerified, setDraftVerified] = useState(false);

  const all = data.reviews as CommunityReviewJoinedRow[];
  const counts = useMemo(() => {
    const c = { all: all.length, pending: 0, published: 0, rejected: 0 };
    for (const r of all) c[r.status]++;
    return c;
  }, [all]);

  const filtered = filter === "all" ? all : all.filter((r) => r.status === filter);

  async function setStatus(id: number, status: CommunityReviewStatus) {
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
              <h3 className="font-semibold text-sm mb-1">Không có đánh giá nào ở filter này</h3>
              <p className="text-xs text-muted-foreground">
                Đánh giá mới xuất hiện khi seller submit trên landing (POST
                /api/v1/community/reviews) — mặc định "Chờ duyệt". Chỉ hiển thị
                công khai khi Đã đăng + "Verified by THG".
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((r) => {
                const meta = STATUS_META[r.status];
                return (
                  <li key={r.id} className="p-4 hover:bg-surface-muted transition">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{r.title}</span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${meta.color}`}>
                            {meta.label}
                          </span>
                          {r.verified === 1 && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-sky-100 text-sky-800 border-sky-300">
                              <BadgeCheck className="w-3 h-3" /> Verified
                            </span>
                          )}
                          {r.rating != null && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
                              <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {r.rating}/5
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                          <span>{r.reviewer_name}</span>
                          <span className="inline-flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            <a href={`mailto:${r.reviewer_email}`} className="hover:text-foreground">
                              {r.reviewer_email}
                            </a>
                          </span>
                          {r.category_name && (
                            <span className="inline-flex items-center gap-1">
                              <Tag className="w-3 h-3" />
                              {r.category_name}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatTime(r.created_at)}
                          </span>
                        </div>
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
                        <select
                          value={r.status}
                          onChange={(e) => setStatus(r.id, e.target.value as CommunityReviewStatus)}
                          disabled={pendingId === r.id}
                          className="h-8 px-2 text-xs rounded-md border border-border bg-background disabled:opacity-50"
                        >
                          {(Object.keys(STATUS_META) as CommunityReviewStatus[]).map((s) => (
                            <option key={s} value={s}>{STATUS_META[s].label}</option>
                          ))}
                        </select>
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
                );
              })}
            </ul>
          )}
        </Card>
      </PageContainer>
    </>
  );
}
