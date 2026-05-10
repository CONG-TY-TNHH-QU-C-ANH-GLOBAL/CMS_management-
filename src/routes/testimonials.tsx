import { createFileRoute } from "@tanstack/react-router";
import { CmsTopbar } from "@/components/cms/Topbar";
import { Card, PageContainer } from "@/components/cms/ui";
import { TESTIMONIALS } from "@/lib/cms-mock";
import { Plus, Star, GripVertical, Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/testimonials")({
  head: () => ({ meta: [{ title: "Testimonials — THG Content OS" }] }),
  component: TestimonialsPage,
});

function TestimonialsPage() {
  return (
    <>
      <CmsTopbar title="Đánh giá khách hàng" subtitle={`${TESTIMONIALS.length} review · ${TESTIMONIALS.filter(t => t.featured).length} hiển thị trên homepage`} action={
        <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 shadow-soft">
          <Plus className="w-4 h-4" /> Thêm review
        </button>
      } />
      <PageContainer>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TESTIMONIALS.map((t) => (
            <Card key={t.id} className="p-5 flex flex-col group hover:shadow-elevated transition">
              <div className="flex items-start justify-between mb-3">
                <div className="text-2xl">{t.flag}</div>
                <button className="grid place-items-center w-7 h-7 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted transition cursor-grab"><GripVertical className="w-3.5 h-3.5" /></button>
              </div>
              <p className="text-sm leading-relaxed flex-1">"{t.quote}"</p>
              <div className="mt-4 flex items-center gap-1 text-warning">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className={`w-3.5 h-3.5 ${i < t.rating ? "fill-current" : "opacity-20"}`} />
                ))}
              </div>
              <div className="mt-2">
                <div className="font-semibold text-sm">{t.name}</div>
                <div className="text-[11px] text-muted-foreground">{t.role}</div>
              </div>
              <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${t.featured ? "text-success" : "text-muted-foreground"}`}>
                  {t.featured ? <><Eye className="w-3 h-3" /> Hiển thị homepage</> : <><EyeOff className="w-3 h-3" /> Ẩn</>}
                </span>
                <button className="text-[11px] font-medium text-primary hover:underline">Sửa</button>
              </div>
            </Card>
          ))}
        </div>
      </PageContainer>
    </>
  );
}
