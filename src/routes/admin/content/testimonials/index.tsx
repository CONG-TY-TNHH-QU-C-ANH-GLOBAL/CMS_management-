import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronUp, Edit3, Plus, Sparkles, Star, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { ConfirmDialog } from "@/components/cms/ConfirmDialog";
import { LocaleTabs, type Locale } from "@/components/cms/LocaleTabs";
import { Card, PageContainer } from "@/components/cms/ui";
import { TestimonialDialog } from "@/features/content/components/TestimonialDialog";
import {
  deleteTestimonialFn,
  listTestimonialsFn,
  reorderTestimonialsFn,
  type TestimonialRow,
} from "@/features/content/content.actions";
import { TranslationReviewDialog } from "@/features/translations/components/TranslationReviewDialog";
import {
  approveTestimonialTranslationFn,
  deleteTestimonialTranslationFn,
  editTestimonialTranslationFn,
  listTestimonialTranslationsFn,
} from "@/features/translations/translations.actions";

const TESTIMONIAL_FIELDS = [
  { key: "quote", label: "Quote", rows: 5 },
  { key: "author_role", label: "Author role", rows: 2 },
] as const;

export const Route = createFileRoute("/admin/content/testimonials/")({
  head: () => ({ meta: [{ title: "Testimonials — THG Content OS" }] }),
  loader: () => listTestimonialsFn(),
  component: TestimonialsPage,
});

function TestimonialsPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("vi");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<TestimonialRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TestimonialRow | null>(null);
  const [reviewing, setReviewing] = useState<TestimonialRow | null>(null);
  const del = useServerFn(deleteTestimonialFn);
  const reorder = useServerFn(reorderTestimonialsFn);

  const filtered = useMemo(
    () =>
      (data.testimonials as TestimonialRow[])
        .filter((t) => t.locale === locale)
        .sort((a, b) => a.position - b.position),
    [data.testimonials, locale],
  );
  const distinctCount = new Set((data.testimonials as TestimonialRow[]).map((t) => t.position)).size;

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
    const newOrder = [...filtered];
    const target = idx + dir;
    if (target < 0 || target >= newOrder.length) return;
    [newOrder[idx], newOrder[target]] = [newOrder[target], newOrder[idx]];
    try {
      await reorder({ data: { locale, orderedIds: newOrder.map((t) => t.id) } });
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sắp xếp thất bại");
    }
  }

  return (
    <>
      <CmsTopbar
        title="Đánh giá khách hàng"
        subtitle={`${distinctCount} đánh giá — mỗi đánh giá có 3 bản dịch`}
        action={
          <button
            onClick={() => {
              setEditingRow(null);
              setDialogOpen(true);
            }}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 shadow-soft"
          >
            <Plus className="w-4 h-4" /> Thêm review
          </button>
        }
      />
      <PageContainer>
        <Card className="overflow-hidden">
          <LocaleTabs value={locale} onChange={setLocale} />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {filtered.length === 0 && (
              <div className="col-span-full px-5 py-12 text-center text-muted-foreground text-sm">
                Chưa có review ở ngôn ngữ này.
              </div>
            )}
            {filtered.map((t, idx) => (
              <Card key={t.id} className="p-5 flex flex-col group hover:shadow-elevated transition">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    #{t.position}
                  </span>
                  <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition">
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
                      disabled={idx === filtered.length - 1}
                      className="grid place-items-center w-6 h-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Xuống"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <p className="text-sm leading-relaxed flex-1 italic">"{t.quote}"</p>
                <div className="mt-4 flex items-center gap-1 text-warning">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-current" />
                  ))}
                </div>
                <div className="mt-2">
                  <div className="font-semibold text-sm">{t.author_name}</div>
                  <div className="text-[11px] text-muted-foreground">{t.author_role}</div>
                </div>
                <div className="mt-3 pt-3 border-t border-border flex items-center justify-end gap-1">
                  {locale === "vi" ? (
                    <button
                      onClick={() => setReviewing(t)}
                      className="text-[11px] font-medium text-blue-700 hover:underline inline-flex items-center gap-1"
                      title="AI Translate (EN + ZH)"
                    >
                      <Sparkles className="w-3 h-3" /> AI dịch
                    </button>
                  ) : null}
                  <button
                    onClick={() => {
                      setEditingRow(t);
                      setDialogOpen(true);
                    }}
                    className="ml-2 text-[11px] font-medium text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <Edit3 className="w-3 h-3" /> Sửa
                  </button>
                  <button
                    onClick={() => setConfirmDelete(t)}
                    className="ml-2 text-[11px] font-medium text-red-600 hover:underline inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Xóa
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </Card>
      </PageContainer>

      <TestimonialDialog
        key={editingRow?.id ?? "new"}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        locale={locale}
        row={editingRow}
        onSaved={() => router.invalidate()}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Xóa đánh giá?"
        description={`Sẽ xóa đánh giá của ${confirmDelete?.author_name}. Hành động này không thể hoàn tác.`}
        confirmLabel="Xóa"
        destructive
      />

      {reviewing ? (
        <TranslationReviewDialog
          open={reviewing !== null}
          onOpenChange={(o) => !o && setReviewing(null)}
          onChanged={() => router.invalidate()}
          entityType="testimonial"
          entityId={reviewing.id}
          entityLabel="Testimonial"
          source={{ quote: reviewing.quote, author_role: reviewing.author_role ?? "" }}
          fields={TESTIMONIAL_FIELDS}
          rpcs={{
            list: listTestimonialTranslationsFn,
            approve: approveTestimonialTranslationFn,
            edit: editTestimonialTranslationFn,
            delete: deleteTestimonialTranslationFn,
          }}
          listIdKey="testimonial_id"
        />
      ) : null}
    </>
  );
}
