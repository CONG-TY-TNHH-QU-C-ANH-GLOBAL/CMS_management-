import { createFileRoute } from "@tanstack/react-router";
import { CmsTopbar } from "@/components/cms/Topbar";
import { Card, PageContainer } from "@/components/cms/ui";
import { Upload, Image as ImageIcon, Folder } from "lucide-react";

export const Route = createFileRoute("/media")({
  head: () => ({ meta: [{ title: "Media Library — THG Content OS" }] }),
  component: MediaPage,
});

const ITEMS = Array.from({ length: 18 }).map((_, i) => ({
  id: `m${i}`,
  hue: (i * 37) % 360,
  size: `${(Math.random() * 2 + 0.2).toFixed(1)} MB`,
  name: ["hero-bg", "warehouse-vn", "tiktok-shop", "fulfillment-flow", "team-photo", "epacket-box"][i % 6] + `-${i + 1}.jpg`,
}));

function MediaPage() {
  return (
    <>
      <CmsTopbar title="Media Library" subtitle="248 tệp · 1.4 GB sử dụng" action={
        <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 shadow-soft">
          <Upload className="w-4 h-4" /> Tải lên
        </button>
      } />
      <PageContainer>
        <div className="flex gap-2 mb-4 flex-wrap">
          {[
            { icon: Folder, label: "Tất cả", count: 248, active: true },
            { icon: ImageIcon, label: "Hero & Banner", count: 32 },
            { icon: ImageIcon, label: "Sản phẩm", count: 124 },
            { icon: ImageIcon, label: "Logo & Icon", count: 48 },
            { icon: ImageIcon, label: "Blog images", count: 44 },
          ].map((c) => (
            <button key={c.label} className={`inline-flex items-center gap-2 h-9 px-3 rounded-lg text-sm transition ${c.active ? "bg-foreground text-background" : "border border-border bg-surface hover:bg-surface-muted"}`}>
              <c.icon className="w-4 h-4" />
              {c.label}
              <span className={`text-[10px] font-semibold rounded-full px-1.5 py-0.5 ${c.active ? "bg-white/20" : "bg-muted text-muted-foreground"}`}>{c.count}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {ITEMS.map((it) => (
            <Card key={it.id} className="overflow-hidden cursor-pointer group">
              <div
                className="aspect-square relative"
                style={{ background: `linear-gradient(135deg, oklch(0.85 0.12 ${it.hue}), oklch(0.75 0.18 ${(it.hue + 60) % 360}))` }}
              >
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-end p-2 opacity-0 group-hover:opacity-100">
                  <div className="text-[10px] text-white font-medium truncate w-full">{it.name}</div>
                </div>
              </div>
              <div className="p-2">
                <div className="text-[11px] truncate font-medium">{it.name}</div>
                <div className="text-[10px] text-muted-foreground">{it.size}</div>
              </div>
            </Card>
          ))}
        </div>
      </PageContainer>
    </>
  );
}
