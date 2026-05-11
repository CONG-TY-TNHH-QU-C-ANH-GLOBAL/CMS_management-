import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronUp, Edit3, ExternalLink, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { ConfirmDialog } from "@/components/cms/ConfirmDialog";
import { Card, PageContainer } from "@/components/cms/ui";
import { IntegrationDialog } from "@/features/content/components/IntegrationDialog";
import {
  deleteIntegrationFn,
  listIntegrationsFn,
  reorderIntegrationsFn,
  type IntegrationRow,
} from "@/features/content/content.actions";

export const Route = createFileRoute("/admin/content/marketplaces/")({
  head: () => ({ meta: [{ title: "Sàn thương mại — THG Content OS" }] }),
  loader: () => listIntegrationsFn(),
  component: MarketplacesPage,
});

function MarketplacesPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<IntegrationRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<IntegrationRow | null>(null);
  const del = useServerFn(deleteIntegrationFn);
  const reorder = useServerFn(reorderIntegrationsFn);

  const integrations = (data.integrations as IntegrationRow[]).sort((a, b) => a.position - b.position);

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
    const newOrder = [...integrations];
    const target = idx + dir;
    if (target < 0 || target >= newOrder.length) return;
    [newOrder[idx], newOrder[target]] = [newOrder[target], newOrder[idx]];
    try {
      await reorder({ data: { orderedIds: newOrder.map((i) => i.id) } });
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sắp xếp thất bại");
    }
  }

  return (
    <>
      <CmsTopbar
        title="Sàn thương mại"
        subtitle={`${integrations.length} sàn — hiển thị tại khu vực "Tích hợp" trên trang chủ`}
        action={
          <button
            onClick={() => {
              setEditingRow(null);
              setDialogOpen(true);
            }}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 shadow-soft"
          >
            <Plus className="w-4 h-4" /> Thêm platform
          </button>
        }
      />
      <PageContainer>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {integrations.map((m, idx) => (
            <Card key={m.id} className={`p-5 border-2 ${m.color_class ?? "border-border"} hover:shadow-elevated transition group`}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="font-semibold text-base">{m.name}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                    Position #{m.position}
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
                      disabled={idx === integrations.length - 1}
                      className="grid place-items-center w-6 h-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Xuống"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      setEditingRow(m);
                      setDialogOpen(true);
                    }}
                    className="grid place-items-center w-7 h-7 rounded-md border border-border bg-surface text-muted-foreground hover:text-foreground"
                    title="Sửa"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(m)}
                    className="grid place-items-center w-7 h-7 rounded-md border border-border bg-surface text-red-600 hover:bg-red-50"
                    title="Xóa"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {m.url && (
                <a
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <ExternalLink className="w-3 h-3" /> {m.url.replace(/^https?:\/\//, "")}
                </a>
              )}
            </Card>
          ))}
        </div>
      </PageContainer>

      <IntegrationDialog
        key={editingRow?.id ?? "new"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        row={editingRow}
        onSaved={() => router.invalidate()}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Xóa sàn thương mại?"
        description={`Sẽ xóa "${confirmDelete?.name}" khỏi danh sách. Hành động này không thể hoàn tác.`}
        confirmLabel="Xóa"
        destructive
      />
    </>
  );
}
