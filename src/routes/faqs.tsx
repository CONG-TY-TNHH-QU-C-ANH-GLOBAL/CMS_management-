import { createFileRoute } from "@tanstack/react-router";
import { CmsTopbar } from "@/components/cms/Topbar";
import { Card, PageContainer } from "@/components/cms/ui";
import { FAQS } from "@/lib/cms-mock";
import { Plus, ChevronDown, Eye, Edit3 } from "lucide-react";

export const Route = createFileRoute("/faqs")({
  head: () => ({ meta: [{ title: "FAQ — THG Content OS" }] }),
  component: FaqsPage,
});

function FaqsPage() {
  return (
    <>
      <CmsTopbar
        title="FAQ"
        subtitle={`${FAQS.length} câu hỏi đang hiển thị`}
        action={
          <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 shadow-soft">
            <Plus className="w-4 h-4" /> Thêm FAQ
          </button>
        }
      />
      <PageContainer>
        <div className="space-y-2">
          {FAQS.map((f) => (
            <Card key={f.id} className="p-4 hover:shadow-elevated transition group">
              <div className="flex items-center gap-4">
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{f.q}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-3">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-foreground/70">{f.category}</span>
                    <span className="inline-flex items-center gap-1"><Eye className="w-3 h-3" />{f.views.toLocaleString("vi-VN")} lượt xem</span>
                    <span>cập nhật {f.updated} trước</span>
                  </div>
                </div>
                <button className="grid place-items-center w-8 h-8 rounded-md border border-border bg-surface opacity-0 group-hover:opacity-100 transition">
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      </PageContainer>
    </>
  );
}
