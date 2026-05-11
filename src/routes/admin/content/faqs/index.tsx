import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronUp, Edit3, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { ConfirmDialog } from "@/components/cms/ConfirmDialog";
import { LocaleTabs, type Locale } from "@/components/cms/LocaleTabs";
import { Card, PageContainer } from "@/components/cms/ui";
import { FaqDialog } from "@/features/content/components/FaqDialog";
import {
  deleteFaqFn,
  listHomeFaqsFn,
  reorderFaqsFn,
  type FaqRow,
} from "@/features/content/content.actions";

export const Route = createFileRoute("/admin/content/faqs/")({
  head: () => ({ meta: [{ title: "FAQ — THG Content OS" }] }),
  loader: () => listHomeFaqsFn(),
  component: FaqsPage,
});

function FaqsPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("en");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<FaqRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<FaqRow | null>(null);
  const deleteFaq = useServerFn(deleteFaqFn);
  const reorder = useServerFn(reorderFaqsFn);

  const filtered = useMemo(
    () =>
      (data.faqs as FaqRow[])
        .filter((f) => f.locale === locale)
        .sort((a, b) => a.position - b.position),
    [data.faqs, locale],
  );
  const distinctPositions = new Set((data.faqs as FaqRow[]).map((f) => f.position)).size;

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteFaq({ data: { id: confirmDelete.id } });
      toast.success("Đã xóa FAQ");
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xóa thất bại");
    }
  }

  async function move(idx: number, dir: -1 | 1) {
    const newOrder = [...filtered];
    const target = idx + dir;
    if (target < 0 || target >= newOrder.length) return;
    [newOrder[idx], newOrder[target]] = [newOrder[target], newOrder[idx]];
    try {
      await reorder({ data: { scope: "home", locale, orderedIds: newOrder.map((f) => f.id) } });
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sắp xếp thất bại");
    }
  }

  return (
    <>
      <CmsTopbar
        title="Câu hỏi thường gặp"
        subtitle={`${distinctPositions} câu hỏi — hiển thị tại trang chủ, có 3 bản dịch mỗi câu`}
        action={
          <button
            onClick={() => {
              setEditingRow(null);
              setDialogOpen(true);
            }}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 shadow-soft"
          >
            <Plus className="w-4 h-4" /> Thêm FAQ
          </button>
        }
      />
      <PageContainer>
        <Card className="overflow-hidden">
          <LocaleTabs value={locale} onChange={setLocale} />
          <div className="divide-y divide-border">
            {filtered.length === 0 && (
              <div className="px-5 py-12 text-center text-muted-foreground text-sm">
                Chưa có FAQ nào ở ngôn ngữ này.
              </div>
            )}
            {filtered.map((f, idx) => (
              <div key={f.id} className="p-4 hover:bg-surface-muted transition group">
                <div className="flex items-start gap-3">
                  <div className="flex flex-col gap-0.5 mt-0.5">
                    <button
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0}
                      className="grid place-items-center w-6 h-6 rounded-md border border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-surface-muted disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Lên"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => move(idx, +1)}
                      disabled={idx === filtered.length - 1}
                      className="grid place-items-center w-6 h-6 rounded-md border border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-surface-muted disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Xuống"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">
                      <span className="text-muted-foreground mr-2">#{f.position}</span>
                      {f.question}
                    </div>
                    <div className="text-[13px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                      {f.answer}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={() => {
                        setEditingRow(f);
                        setDialogOpen(true);
                      }}
                      className="grid place-items-center w-8 h-8 rounded-md border border-border bg-surface hover:bg-surface-muted"
                      title="Sửa"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(f)}
                      className="grid place-items-center w-8 h-8 rounded-md border border-border bg-surface text-red-600 hover:bg-red-50"
                      title="Xóa"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </PageContainer>

      {/* Remount on row change so useState defaults pick up new values */}
      <FaqDialog
        key={editingRow?.id ?? "new"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        scope="home"
        locale={locale}
        row={editingRow}
        onSaved={() => router.invalidate()}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Xóa FAQ?"
        description={`Sẽ xóa câu hỏi "${confirmDelete?.question.slice(0, 80)}${(confirmDelete?.question.length ?? 0) > 80 ? "..." : ""}". Hành động này không thể hoàn tác.`}
        confirmLabel="Xóa"
        destructive
      />
    </>
  );
}
