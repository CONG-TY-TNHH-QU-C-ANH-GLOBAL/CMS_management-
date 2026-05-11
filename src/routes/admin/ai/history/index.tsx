import { createFileRoute } from "@tanstack/react-router";
import { CmsTopbar } from "@/components/app-shell/Topbar";
import { Card, PageContainer } from "@/components/cms/ui";
import { CheckCircle2, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/admin/ai/history/")({
  head: () => ({ meta: [{ title: "Lịch sử publish — THG Content OS" }] }),
  component: HistoryPage,
});

const HISTORY = [
  { id: "h1", title: "Pricing — March 2025", target: "Pricing", by: "Hoa Lê", time: "Hôm nay 10:32" },
  { id: "h2", title: "Hero homepage v3.1", target: "Landing", by: "Linh Trần", time: "Hôm qua 15:48" },
  { id: "h3", title: "Blog: TikTok Shop guide 2025", target: "Blog", by: "AI Agent + Linh Trần", time: "2 ngày trước" },
  { id: "h4", title: "FAQ: cập nhật 5 câu hỏi", target: "FAQ", by: "An Phạm", time: "3 ngày trước" },
  { id: "h5", title: "Service: TikTok Logistics ra mắt", target: "Services", by: "Khôi Vũ", time: "1 tuần trước" },
];

function HistoryPage() {
  return (
    <>
      <CmsTopbar title="Lịch sử publish" subtitle="Bản đã xuất bản gần đây" />
      <PageContainer>
        <Card>
          <ul className="divide-y divide-border">
            {HISTORY.map((h) => (
              <li key={h.id} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-muted transition">
                <div className="grid place-items-center w-9 h-9 rounded-lg bg-success/10 text-success shrink-0"><CheckCircle2 className="w-4 h-4" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{h.title}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">→ {h.target} · publish bởi {h.by} · {h.time}</div>
                </div>
                <button className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-surface text-xs font-medium hover:bg-surface-muted transition">
                  <RotateCcw className="w-3.5 h-3.5" /> Rollback
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </PageContainer>
    </>
  );
}
