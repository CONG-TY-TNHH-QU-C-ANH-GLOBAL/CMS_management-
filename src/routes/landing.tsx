import { createFileRoute } from "@tanstack/react-router";
import { CmsTopbar } from "@/components/cms/Topbar";
import { Card, CardHeader, PageContainer } from "@/components/cms/ui";
import { Eye, Edit3, Image as ImageIcon, Type, Layout, Sparkles, History } from "lucide-react";

export const Route = createFileRoute("/landing")({
  head: () => ({ meta: [{ title: "Landing Page — THG Content OS" }] }),
  component: LandingPage,
});

const SECTIONS = [
  { id: "hero", icon: Sparkles, title: "Hero Section", desc: "Tiêu đề chính, sub-headline, CTA, ảnh nền", fields: 6, lastEdit: "2 giờ trước", status: "review" },
  { id: "trust", icon: Layout, title: "Trust Bar", desc: "Logo khách hàng, số liệu nổi bật", fields: 8, lastEdit: "1 tuần trước", status: "live" },
  { id: "services", icon: Layout, title: "Services Grid", desc: "Card dịch vụ + icon + mô tả ngắn", fields: 12, lastEdit: "3 ngày trước", status: "live" },
  { id: "process", icon: Layout, title: "How It Works", desc: "4 bước quy trình fulfillment", fields: 16, lastEdit: "2 tuần trước", status: "live" },
  { id: "pricing", icon: Layout, title: "Pricing Preview", desc: "Bảng giá rút gọn với 3 plan", fields: 9, lastEdit: "5 giờ trước", status: "review" },
  { id: "testimonials", icon: Layout, title: "Testimonials", desc: "Carousel review từ khách hàng", fields: 15, lastEdit: "1 tháng trước", status: "live" },
  { id: "faq", icon: Layout, title: "FAQ Preview", desc: "5 câu hỏi thường gặp", fields: 10, lastEdit: "2 tuần trước", status: "live" },
  { id: "cta", icon: Layout, title: "Final CTA", desc: "Section đăng ký nhận quote", fields: 4, lastEdit: "1 tháng trước", status: "live" },
];

export default function LandingPage() {
  return (
    <>
      <CmsTopbar
        title="Landing Page"
        subtitle="thgfulfill.com"
        action={
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-surface text-sm font-medium hover:bg-surface-muted transition">
              <History className="w-4 h-4" /> Lịch sử
            </button>
            <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-surface text-sm font-medium hover:bg-surface-muted transition">
              <Eye className="w-4 h-4" /> Xem trước
            </button>
            <button className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 shadow-soft transition">
              Publish thay đổi
            </button>
          </div>
        }
      />
      <PageContainer>
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <div>
                <div className="text-sm font-semibold">Cấu trúc trang</div>
                <div className="text-xs text-muted-foreground">8 section · click để chỉnh từng phần</div>
              </div>
              <div className="text-[11px] text-muted-foreground">v3.2 · cập nhật 2 giờ trước</div>
            </div>

            {SECTIONS.map((s, i) => (
              <Card key={s.id} className="p-4 hover:shadow-elevated hover:border-primary/30 transition cursor-pointer group">
                <div className="flex items-center gap-4">
                  <div className="text-[11px] font-mono text-muted-foreground w-6 text-center">{String(i + 1).padStart(2, "0")}</div>
                  <div className="grid place-items-center w-10 h-10 rounded-lg bg-primary-soft text-primary">
                    <s.icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-sm">{s.title}</div>
                      {s.status === "review" && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-warning/10 text-warning-foreground border border-warning/30">
                          có thay đổi chờ duyệt
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{s.desc}</div>
                  </div>
                  <div className="hidden md:flex flex-col items-end gap-0.5 text-[11px] text-muted-foreground">
                    <span>{s.fields} fields</span>
                    <span>{s.lastEdit}</span>
                  </div>
                  <button className="grid place-items-center w-8 h-8 rounded-md border border-border bg-surface text-muted-foreground group-hover:text-foreground group-hover:border-primary transition">
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </Card>
            ))}
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader title="Xem trước" hint="Live preview thgfulfill.com" />
              <div className="p-4">
                <div className="aspect-[9/16] rounded-lg border border-border bg-gradient-soft overflow-hidden relative">
                  <div className="absolute inset-x-0 top-0 h-8 bg-white/70 backdrop-blur border-b border-border flex items-center px-3 gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-destructive/50" />
                    <div className="w-2 h-2 rounded-full bg-warning/50" />
                    <div className="w-2 h-2 rounded-full bg-success/50" />
                    <div className="ml-3 text-[10px] text-muted-foreground">thgfulfill.com</div>
                  </div>
                  <div className="absolute inset-x-0 top-8 bottom-0 p-4 flex flex-col gap-2">
                    <div className="h-3 w-3/4 rounded bg-foreground/80" />
                    <div className="h-2 w-full rounded bg-muted-foreground/30" />
                    <div className="h-2 w-5/6 rounded bg-muted-foreground/30" />
                    <div className="mt-2 h-7 w-24 rounded-md bg-gradient-brand" />
                    <div className="mt-4 grid grid-cols-2 gap-1.5">
                      <div className="aspect-video rounded bg-white/70" />
                      <div className="aspect-video rounded bg-white/70" />
                      <div className="aspect-video rounded bg-white/70" />
                      <div className="aspect-video rounded bg-white/70" />
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Render mock</span>
                  <button className="text-primary hover:underline font-medium">Mở full preview ↗</button>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Type className="w-4 h-4 text-primary" />
                <div className="text-sm font-semibold">SEO & Meta</div>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Title</span><span className="font-medium">62 ký tự ✓</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Description</span><span className="font-medium">148 ký tự ✓</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">OG Image</span><span className="font-medium text-success">Đã có</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">JSON-LD</span><span className="font-medium text-success">Hợp lệ</span></div>
              </div>
            </Card>
          </div>
        </div>
      </PageContainer>
    </>
  );
}
