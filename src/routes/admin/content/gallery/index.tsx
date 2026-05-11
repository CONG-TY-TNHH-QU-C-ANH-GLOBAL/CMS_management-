import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, Edit3, Eye, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { ConfirmDialog } from "@/components/cms/ConfirmDialog";
import { Card, PageContainer } from "@/components/cms/ui";
import { MarqueeImageDialog } from "@/features/content/components/MarqueeImageDialog";
import {
  deleteMarqueeImageFn,
  listMarqueeImagesFn,
  reorderMarqueeImagesFn,
  type MarqueeImageRow,
} from "@/features/content/content.actions";

export const Route = createFileRoute("/admin/content/gallery/")({
  head: () => ({ meta: [{ title: "Banner cuộn trang chủ — THG Content OS" }] }),
  loader: () => listMarqueeImagesFn(),
  component: GalleryPage,
});

function GalleryPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<MarqueeImageRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<MarqueeImageRow | null>(null);
  const del = useServerFn(deleteMarqueeImageFn);
  const reorder = useServerFn(reorderMarqueeImagesFn);

  const images = (data.images as MarqueeImageRow[]).sort((a, b) => a.position - b.position);

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await del({ data: { id: confirmDelete.id } });
      toast.success("Đã xóa ảnh");
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xóa thất bại");
    }
  }

  async function move(idx: number, dir: -1 | 1) {
    const newOrder = [...images];
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
        title="Banner cuộn trang chủ"
        subtitle={`${images.length} ảnh — chạy ngang tại khu vực "Năng lực vận hành thực tế" trên trang chủ`}
        action={
          <button
            onClick={() => {
              setEditingRow(null);
              setDialogOpen(true);
            }}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 shadow-soft"
          >
            <Plus className="w-4 h-4" /> Thêm ảnh
          </button>
        }
      />
      <PageContainer>
        <div className="rounded-xl border border-info/20 bg-info/5 p-3 mb-4 text-xs">
          <span className="font-semibold">Lưu ý:</span> Hiện tại thêm ảnh bằng đường dẫn URL từ kho ảnh có sẵn
          (ví dụ ladicdn, Cloudinary). Tính năng tải ảnh trực tiếp lên CMS sẽ được bổ sung sau.
          Mô tả ảnh (alt) bắt buộc — giúp Google + người khiếm thị hiểu nội dung.
        </div>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
          {images.map((g, idx) => (
            <Card key={g.id} className="overflow-hidden group">
              <div className="aspect-video relative bg-muted">
                <img
                  src={g.src}
                  alt={g.alt_text}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute top-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    className="grid place-items-center w-7 h-7 rounded-md bg-black/50 text-white hover:bg-black/70 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Trái"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => move(idx, +1)}
                    disabled={idx === images.length - 1}
                    className="grid place-items-center w-7 h-7 rounded-md bg-black/50 text-white hover:bg-black/70 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Phải"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                  <a
                    href={g.src}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="grid place-items-center w-7 h-7 rounded-md bg-black/50 text-white hover:bg-black/70"
                    title="Xem ảnh gốc"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={() => {
                      setEditingRow(g);
                      setDialogOpen(true);
                    }}
                    className="grid place-items-center w-7 h-7 rounded-md bg-black/50 text-white hover:bg-black/70"
                    title="Sửa"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(g)}
                    className="grid place-items-center w-7 h-7 rounded-md bg-black/50 text-white hover:bg-destructive"
                    title="Xóa"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="absolute bottom-2 left-2 text-[10px] font-semibold text-white bg-black/50 px-1.5 py-0.5 rounded">
                  #{g.position}
                </div>
              </div>
              <div className="p-3">
                <div className="text-xs font-medium line-clamp-1">{g.alt_text}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                  {g.src.startsWith("http") ? "External URL" : `R2: ${g.src}`}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </PageContainer>

      <MarqueeImageDialog
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
        title="Xóa ảnh khỏi thư viện?"
        description={`Sẽ xóa ảnh "${confirmDelete?.alt_text}" khỏi khu vực ảnh chạy ngang trang chủ. Hành động này không thể hoàn tác.`}
        confirmLabel="Xóa"
        destructive
      />
    </>
  );
}
