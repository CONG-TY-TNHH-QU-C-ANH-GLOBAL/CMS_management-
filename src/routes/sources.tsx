import { createFileRoute } from "@tanstack/react-router";
import { CmsTopbar } from "@/components/cms/Topbar";
import { Card, PageContainer } from "@/components/cms/ui";
import { Inbox, Send, FileText, Link2, MessageSquare } from "lucide-react";

export const Route = createFileRoute("/sources")({
  head: () => ({ meta: [{ title: "Source Inbox — THG Content OS" }] }),
  component: SourcesPage,
});

const SOURCES = [
  { id: "s1", title: "DHL: Q1 2025 Cross-border report", from: "URL", icon: Link2, time: "1 giờ", status: "Đã lấy nội dung" },
  { id: "s2", title: "Customer support: ticket #2451 — TikTok docs", from: "Telegram", icon: Send, time: "3 giờ", status: "Sẵn sàng tổng hợp" },
  { id: "s3", title: "PDF: TikTok Shop Seller Policy 03/2025", from: "Upload", icon: FileText, time: "5 giờ", status: "Đã OCR" },
  { id: "s4", title: "Slack thread: route comparison VN→US", from: "Slack", icon: MessageSquare, time: "1 ngày", status: "Đã import" },
];

function SourcesPage() {
  return (
    <>
      <CmsTopbar title="Source Inbox" subtitle="Nguồn cấp dữ liệu cho agent" />
      <PageContainer>
        <Card>
          <ul className="divide-y divide-border">
            {SOURCES.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-muted transition">
                <div className="grid place-items-center w-9 h-9 rounded-lg bg-primary-soft text-primary"><s.icon className="w-4 h-4" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{s.title}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Từ {s.from} · {s.time} trước</div>
                </div>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full border border-success/20 bg-success/10 text-success">{s.status}</span>
                <button className="text-xs font-medium text-primary hover:underline">Tạo job →</button>
              </li>
            ))}
          </ul>
        </Card>
      </PageContainer>
    </>
  );
}
