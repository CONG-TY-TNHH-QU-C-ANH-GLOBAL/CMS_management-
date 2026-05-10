import { createFileRoute } from "@tanstack/react-router";
import { CmsTopbar } from "@/components/cms/Topbar";
import { Card, CardHeader, PageContainer } from "@/components/cms/ui";
import { Send, Check, Bot } from "lucide-react";

export const Route = createFileRoute("/telegram")({
  head: () => ({ meta: [{ title: "Telegram — THG Content OS" }] }),
  component: TelegramPage,
});

function TelegramPage() {
  return (
    <>
      <CmsTopbar title="Tích hợp Telegram" subtitle="Gửi yêu cầu agent qua Telegram" />
      <PageContainer>
        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader title="Bot kết nối" />
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="grid place-items-center w-12 h-12 rounded-xl bg-info/10 text-info"><Send className="w-5 h-5" /></div>
                <div className="flex-1">
                  <div className="font-semibold">@thg_content_bot</div>
                  <div className="text-xs text-muted-foreground">Đã kết nối · webhook OK</div>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20">
                  <Check className="w-3 h-3" /> Active
                </span>
              </div>
              <div className="rounded-lg border border-border bg-surface-muted p-3 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Allowed chat IDs</span><span className="font-mono">3 chat</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Webhook URL</span><span className="font-mono truncate ml-3">…/api/tg/webhook</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Message hôm nay</span><span className="font-semibold">42</span></div>
              </div>
              <button className="w-full h-9 rounded-lg border border-border bg-surface text-sm font-medium hover:bg-surface-muted">Cấu hình bot</button>
            </div>
          </Card>

          <Card>
            <CardHeader title="Conversation gần đây" hint="3 chat đang mở" />
            <ul className="divide-y divide-border max-h-[420px] overflow-y-auto">
              {[
                { who: "Minh Nguyễn", msg: "/agent rewrite hero homepage cho POD focus", time: "2 giờ", reply: "✅ Job aj2 đã tạo, sẽ ping khi xong" },
                { who: "Khôi Vũ", msg: "/draft pricing TikTok line +5%", time: "4 giờ", reply: "✅ Draft đã gửi vào queue duyệt" },
                { who: "Linh Trần", msg: "/list pending", time: "Hôm qua", reply: "Có 7 item đang chờ duyệt" },
              ].map((c, i) => (
                <li key={i} className="px-5 py-3 hover:bg-surface-muted transition">
                  <div className="flex items-center gap-2">
                    <div className="grid place-items-center w-7 h-7 rounded-full bg-gradient-brand text-white text-xs font-semibold">{c.who[0]}</div>
                    <div className="text-xs"><span className="font-medium">{c.who}</span> <span className="text-muted-foreground">· {c.time} trước</span></div>
                  </div>
                  <div className="text-sm font-mono mt-1.5 ml-9 px-2 py-1 rounded bg-muted inline-block">{c.msg}</div>
                  <div className="text-xs text-muted-foreground mt-1.5 ml-9 flex items-center gap-1.5"><Bot className="w-3 h-3" /> {c.reply}</div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </PageContainer>
    </>
  );
}
