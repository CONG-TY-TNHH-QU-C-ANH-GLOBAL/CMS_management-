import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronUp, Edit3, ExternalLink, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { ConfirmDialog } from "@/components/cms/ConfirmDialog";
import { Card, PageContainer } from "@/components/cms/ui";
import { PartnerDialog } from "@/features/partners/components/PartnerDialog";
import {
  deletePartnerFn,
  listPartnersFn,
  reorderPartnersFn,
  updatePartnerFn,
  type PartnerRow,
} from "@/features/partners/partners.actions";

export const Route = createFileRoute("/admin/content/partners/")({
  head: () => ({ meta: [{ title: "Đối tác — THG Content OS" }] }),
  loader: () => listPartnersFn(),
  component: PartnersPage,
});

function PartnersPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<PartnerRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PartnerRow | null>(null);
  const del = useServerFn(deletePartnerFn);
  const reorder = useServerFn(reorderPartnersFn);
  const update = useServerFn(updatePartnerFn);

  const partners = (data.partners as PartnerRow[]).slice().sort((a, b) => a.position - b.position);
  const liveCount = partners.filter((p) => p.status === "live").length;

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await del({ data: { id: confirmDelete.id } });
      toast.success("Đã xóa");
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xóa thất bại");
    }
  }

  async function move(idx: number, dir: -1 | 1) {
    const newOrder = [...partners];
    const target = idx + dir;
    if (target < 0 || target >= newOrder.length) return;
    [newOrder[idx], newOrder[target]] = [newOrder[target], newOrder[idx]];
    try {
      await reorder({ data: { orderedIds: newOrder.map((p) => p.id) } });
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sắp xếp thất bại");
    }
  }

  /** The publish switch this entity ships with — pricing_tables has a status
   *  column with no way to change it, and that made a draft row permanently
   *  invisible. A partner can be pulled off the homepage from here. */
  async function toggleStatus(row: PartnerRow) {
    const next = row.status === "live" ? "draft" : "live";
    try {
      await update({ data: { id: row.id, status: next } });
      toast.success(next === "live" ? "Đã hiển thị trên web" : "Đã ẩn khỏi web");
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Đổi trạng thái thất bại");
    }
  }

  return (
    <>
      <CmsTopbar
        title="Đối tác"
        subtitle={`${partners.length} đối tác — ${liveCount} đang hiển thị trên trang chủ`}
        action={
          <button
            onClick={() => {
              setEditingRow(null);
              setDialogOpen(true);
            }}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 shadow-soft"
          >
            <Plus className="w-4 h-4" /> Thêm đối tác
          </button>
        }
      />
      <PageContainer>
        {partners.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Chưa có đối tác nào. Bấm “Thêm đối tác” để bắt đầu.
          </Card>
        )}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {partners.map((p, idx) => (
            <Card
              key={p.id}
              className="p-5 border border-border hover:shadow-elevated transition group"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <div className="font-semibold text-base truncate">{p.name}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                    #{p.position}
                    {p.tier ? ` · ${p.tier}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0}
                      className="grid place-items-center w-6 h-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Lên"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => move(idx, +1)}
                      disabled={idx === partners.length - 1}
                      className="grid place-items-center w-6 h-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Xuống"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      setEditingRow(p);
                      setDialogOpen(true);
                    }}
                    className="grid place-items-center w-7 h-7 rounded-md border border-border bg-surface text-muted-foreground hover:text-foreground"
                    title="Sửa"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(p)}
                    className="grid place-items-center w-7 h-7 rounded-md border border-border bg-surface text-red-600 hover:bg-red-50"
                    title="Xóa"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <button
                onClick={() => toggleStatus(p)}
                className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-semibold border transition ${
                  p.status === "live"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                    : "bg-muted border-border text-muted-foreground hover:bg-border/40"
                }`}
                title={p.status === "live" ? "Bấm để ẩn khỏi web" : "Bấm để hiển thị trên web"}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${p.status === "live" ? "bg-emerald-500" : "bg-muted-foreground/50"}`}
                />
                {p.status === "live" ? "Đang hiển thị" : "Nháp"}
              </button>

              {p.url && (
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <ExternalLink className="w-3 h-3" /> {p.url.replace(/^https?:\/\//, "")}
                </a>
              )}
            </Card>
          ))}
        </div>
      </PageContainer>

      <PartnerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        row={editingRow}
        onSaved={() => router.invalidate()}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={`Xóa đối tác ${confirmDelete?.name}?`}
        description="Hành động này không thể hoàn tác."
        onConfirm={handleDelete}
      />
    </>
  );
}
