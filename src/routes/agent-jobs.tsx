import { createFileRoute } from "@tanstack/react-router";
import { CmsTopbar } from "@/components/cms/Topbar";
import { Card, CardHeader, PageContainer, StatusBadge } from "@/components/cms/ui";
import { AGENT_JOBS } from "@/lib/cms-mock";
import { Bot, Zap, Send, Calendar, RefreshCw, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

export const Route = createFileRoute("/agent-jobs")({
  head: () => ({ meta: [{ title: "Agent Jobs — THG Content OS" }] }),
  component: AgentJobsPage,
});

const TIMELINE = [
  { ts: "10:32:14", step: "Phân tích prompt", status: "ok", detail: "task=research_blog, lang=vi" },
  { ts: "10:32:18", step: "Tìm kiếm nguồn", status: "ok", detail: "Tìm thấy 24 URLs" },
  { ts: "10:32:45", step: "Lọc theo độ tin cậy", status: "ok", detail: "Chọn 8 nguồn chất lượng" },
  { ts: "10:33:02", step: "Trích xuất nội dung", status: "ok", detail: "7/8 thành công (1 paywall)" },
  { ts: "10:34:11", step: "Tạo outline", status: "ok", detail: "5 section + intro + kết" },
  { ts: "10:34:30", step: "Đang viết bài", status: "running", detail: "~1,200 từ, đang tiến hành…" },
  { ts: null, step: "Tạo SEO metadata", status: "pending", detail: null },
  { ts: null, step: "Lưu draft vào CMS", status: "pending", detail: null },
];

function srcIcon(s: string) {
  if (s === "Telegram") return Send;
  if (s === "Schedule") return Calendar;
  return Bot;
}

function AgentJobsPage() {
  return (
    <>
      <CmsTopbar title="Tác vụ AI" subtitle="Theo dõi tác vụ AI tạo nội dung" />
      <PageContainer>
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-3">
            {AGENT_JOBS.map((j) => {
              const Src = srcIcon(j.source);
              return (
                <Card key={j.id} className="p-4 hover:shadow-elevated transition">
                  <div className="flex items-start gap-3">
                    <div className={[
                      "shrink-0 grid place-items-center w-10 h-10 rounded-lg",
                      j.status === "failed" ? "bg-destructive/10 text-destructive" :
                      j.status === "done" ? "bg-success/10 text-success" : "bg-gradient-brand text-white",
                    ].join(" ")}>
                      {j.status === "running" && <Loader2 className="w-5 h-5 animate-spin" />}
                      {j.status === "review" && <Zap className="w-5 h-5" />}
                      {j.status === "done" && <CheckCircle2 className="w-5 h-5" />}
                      {j.status === "failed" && <AlertCircle className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">{j.task}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
                            <Src className="w-3 h-3" /> {j.source} · {j.by} · {j.started}
                          </div>
                        </div>
                        <StatusBadge status={j.status} />
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className={`h-full ${j.status === "failed" ? "bg-destructive" : "bg-gradient-brand"}`} style={{ width: `${j.progress}%` }} />
                        </div>
                        <span className="text-[11px] text-muted-foreground tabular-nums">{j.progress}%</span>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader title="Job timeline" hint="aj1 — Research blog 2025" />
            <div className="p-4">
              <ol className="relative space-y-3">
                {TIMELINE.map((t, i) => (
                  <li key={i} className="flex gap-3">
                    <div className="relative shrink-0">
                      <div className={[
                        "grid place-items-center w-6 h-6 rounded-full border-2",
                        t.status === "ok" ? "bg-success border-success text-white" :
                        t.status === "running" ? "bg-info border-info text-white animate-pulse" :
                        "bg-surface border-border text-muted-foreground",
                      ].join(" ")}>
                        {t.status === "ok" && <CheckCircle2 className="w-3 h-3" />}
                        {t.status === "running" && <RefreshCw className="w-3 h-3 animate-spin" />}
                      </div>
                      {i < TIMELINE.length - 1 && <div className="absolute left-1/2 -translate-x-1/2 top-6 w-px h-7 bg-border" />}
                    </div>
                    <div className="pb-3 flex-1 min-w-0">
                      <div className="text-xs font-medium">{t.step}</div>
                      {t.detail && <div className="text-[11px] text-muted-foreground mt-0.5">{t.detail}</div>}
                      {t.ts && <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{t.ts}</div>}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </Card>
        </div>
      </PageContainer>
    </>
  );
}
