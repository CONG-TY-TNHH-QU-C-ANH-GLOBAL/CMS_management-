import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronUp, Edit3, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { ConfirmDialog } from "@/components/cms/ConfirmDialog";
import { Card, PageContainer } from "@/components/cms/ui";
import { LeadershipDialog } from "@/features/leadership/components/LeadershipDialog";
import {
  deleteLeadershipFn,
  listLeadershipFn,
  reorderLeadershipFn,
  updateLeadershipFn,
  type LeadershipRow,
} from "@/features/leadership/leadership.actions";
import { toMediaUrl } from "@/features/partners/partners.media";

export const Route = createFileRoute("/admin/content/leadership/")({
  head: () => ({ meta: [{ title: "Leadership — THG Content OS" }] }),
  loader: () => listLeadershipFn(),
  component: LeadershipPage,
});

function LeadershipPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const rows = (data.leadership as LeadershipRow[]).slice().sort((a, b) => a.position - b.position);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LeadershipRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<LeadershipRow | null>(null);
  const update = useServerFn(updateLeadershipFn);
  const reorder = useServerFn(reorderLeadershipFn);
  const remove = useServerFn(deleteLeadershipFn);

  async function toggle(row: LeadershipRow) {
    try {
      await update({ data: { id: row.id, status: row.status === "live" ? "draft" : "live" } });
      await router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Đổi trạng thái thất bại");
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    await reorder({ data: { orderedIds: next.map((row) => row.id) } });
    await router.invalidate();
  }

  return (
    <>
      <CmsTopbar
        title="Leadership"
        subtitle={`${rows.length} card — ${rows.filter((row) => row.status === "live").length} đang hiển thị`}
        action={
          <button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3 text-sm font-medium text-background"
          >
            <Plus className="h-4 w-4" /> Thêm Leadership
          </button>
        }
      />
      <PageContainer>
        {rows.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Chưa có nội dung Leadership.
          </Card>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row, index) => (
            <Card key={row.id} className="group p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{row.name}</div>
                  <div className="text-xs font-medium uppercase tracking-wider text-primary">
                    {row.role || "Chưa có vai trò"}
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                  <button onClick={() => move(index, -1)} disabled={index === 0}>
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button onClick={() => move(index, 1)} disabled={index === rows.length - 1}>
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      setEditing(row);
                      setDialogOpen(true);
                    }}
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button onClick={() => setConfirmDelete(row)} className="text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-3 flex -space-x-2">
                {row.avatars.map((avatar) => (
                  <img
                    key={avatar.media_id}
                    src={toMediaUrl(avatar.r2_key, "") ?? undefined}
                    alt={avatar.alt_text || row.name}
                    className="h-10 w-10 rounded-full border-2 border-background bg-muted object-cover"
                  />
                ))}
              </div>
              {row.quote && (
                <p className="mt-3 line-clamp-3 text-sm italic text-muted-foreground">
                  “{row.quote}”
                </p>
              )}
              <button
                onClick={() => toggle(row)}
                className={`mt-4 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${row.status === "live" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-border bg-muted text-muted-foreground"}`}
              >
                {row.status === "live" ? "Đang hiển thị" : "Nháp"}
              </button>
            </Card>
          ))}
        </div>
      </PageContainer>
      <LeadershipDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        row={editing}
        onSaved={() => router.invalidate()}
      />
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title={`Xóa ${confirmDelete?.name}?`}
        description="Hành động này không thể hoàn tác."
        onConfirm={async () => {
          if (!confirmDelete) return;
          await remove({ data: { id: confirmDelete.id } });
          setConfirmDelete(null);
          await router.invalidate();
        }}
      />
    </>
  );
}
