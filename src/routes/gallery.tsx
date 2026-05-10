import { createFileRoute } from "@tanstack/react-router";
import { CmsTopbar } from "@/components/cms/Topbar";
import { Card, PageContainer } from "@/components/cms/ui";
import { GALLERY } from "@/lib/cms-mock";
import { Upload, GripVertical, Eye, Trash2 } from "lucide-react";

export const Route = createFileRoute("/gallery")({
  head: () => ({ meta: [{ title: "Gallery — THG Content OS" }] }),
  component: GalleryPage,
});

function GalleryPage() {
  return (
    <>
      <CmsTopbar title="Thư viện ảnh" subtitle={`${GALLERY.length} ảnh kho — hiển thị section "Real-world processing capacity"`} action={
        <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 shadow-soft">
          <Upload className="w-4 h-4" /> Tải ảnh lên
        </button>
      } />
      <PageContainer>
        <div className="rounded-xl border border-info/20 bg-info/5 p-3 mb-4 text-xs">
          <span className="font-semibold">Mẹo:</span> Kéo thả để sắp xếp lại thứ tự hiển thị. Alt text giúp SEO + screen reader.
        </div>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
          {GALLERY.map((g) => (
            <Card key={g.id} className="overflow-hidden group">
              <div className="aspect-video relative bg-muted">
                <img src={g.url} alt={g.alt} className="w-full h-full object-cover" loading="lazy" />
                <button className="absolute top-2 left-2 grid place-items-center w-7 h-7 rounded-md bg-black/50 text-white opacity-0 group-hover:opacity-100 transition cursor-grab">
                  <GripVertical className="w-3.5 h-3.5" />
                </button>
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button className="grid place-items-center w-7 h-7 rounded-md bg-black/50 text-white"><Eye className="w-3.5 h-3.5" /></button>
                  <button className="grid place-items-center w-7 h-7 rounded-md bg-black/50 text-white hover:bg-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <div className="p-3">
                <div className="text-xs font-medium">{g.alt}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">ID: {g.id}</div>
              </div>
            </Card>
          ))}
        </div>
      </PageContainer>
    </>
  );
}
