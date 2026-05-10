import { createFileRoute, Link } from "@tanstack/react-router";
import { CmsTopbar } from "@/components/cms/Topbar";
import { Card, CardHeader, PageContainer, RiskBadge, StatusBadge } from "@/components/cms/ui";
import { ACTIVITY_FEED, AGENT_JOBS, PENDING_REVIEWS, STATS } from "@/lib/cms-mock";
import {
  ArrowUpRight, ArrowDownRight, Activity, Bot, FileText, CheckCheck,
  GitPullRequest, Sparkles, Plus, ChevronRight, Zap, Clock,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Dashboard — THG Content OS" }] }),
  component: Dashboard,
});

function Dashboard() {
  return (
    <>
      <CmsTopbar title="Dashboard" subtitle="Tổng quan hệ thống nội dung" />
      <PageContainer>
        {/* Hero */}
        <section className="relative overflow-hidden rounded-2xl bg-gradient-hero border border-border p-6 sm:p-8 mb-6">
          <div className="absolute inset-0 opacity-40 pointer-events-none" style={{ background: "radial-gradient(600px 200px at 80% 0%, oklch(0.85 0.15 280 / 0.4), transparent)" }} />
          <div className="relative flex flex-col md:flex-row md:items-end gap-6 justify-between">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border border-border bg-surface/70 backdrop-blur mb-3">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                Chào buổi sáng, Minh
              </div>
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight max-w-xl">
                Hôm nay có <span className="text-gradient">12 bản nháp</span> đang chờ bạn duyệt
              </h2>
              <p className="text-sm text-muted-foreground mt-2 max-w-lg">
                Agent vừa hoàn tất 3 job qua đêm. Có 2 thay đổi giá cần phê duyệt trước 16:00 để publish kịp campaign tháng 3.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <Link to="/reviews" className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 shadow-soft transition">
                <CheckCheck className="w-4 h-4" />
                Mở queue duyệt
              </Link>
              <button className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg border border-border bg-surface/80 backdrop-blur text-sm font-medium hover:bg-surface transition">
                <Plus className="w-4 h-4" />
                Tạo bài mới
              </button>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {STATS.map((s) => (
            <Card key={s.label} className="p-4">
              <div className="text-xs text-muted-foreground font-medium">{s.label}</div>
              <div className="flex items-end gap-2 mt-1.5">
                <div className="text-2xl font-semibold tracking-tight">{s.value}</div>
                <div
                  className={[
                    "text-[11px] font-semibold inline-flex items-center gap-0.5 pb-1",
                    s.trend === "up" ? "text-success" : s.trend === "down" ? "text-destructive" : "text-info",
                  ].join(" ")}
                >
                  {s.trend === "up" && <ArrowUpRight className="w-3 h-3" />}
                  {s.trend === "down" && <ArrowDownRight className="w-3 h-3" />}
                  {s.trend === "live" && <Activity className="w-3 h-3 animate-pulse" />}
                  {s.delta}
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">{s.hint}</div>
            </Card>
          ))}
        </section>

        {/* Two-col */}
        <section className="grid lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader
              title="Chờ duyệt"
              hint="Bản nháp cần được phê duyệt trước khi publish"
              action={<Link to="/reviews" className="text-xs font-medium text-primary inline-flex items-center gap-0.5 hover:underline">Xem tất cả <ChevronRight className="w-3 h-3" /></Link>}
            />
            <ul className="divide-y divide-border">
              {PENDING_REVIEWS.slice(0, 5).map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-muted transition cursor-pointer">
                  <div className={`shrink-0 grid place-items-center w-9 h-9 rounded-lg ${r.ai ? "bg-gradient-brand text-white" : "bg-muted text-foreground"}`}>
                    {r.ai ? <Bot className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.title}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
                      <span>{r.type}</span>·<span>{r.by}</span>·<span className="inline-flex items-center gap-0.5"><Clock className="w-3 h-3" />{r.time}</span>
                    </div>
                  </div>
                  <RiskBadge risk={r.risk} />
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Hoạt động gần đây" />
            <ul className="px-2 py-2 space-y-1">
              {ACTIVITY_FEED.map((a) => (
                <li key={a.id} className="flex gap-3 px-3 py-2 rounded-lg hover:bg-surface-muted transition">
                  <div className={[
                    "shrink-0 mt-1 w-1.5 h-1.5 rounded-full",
                    a.type === "approve" || a.type === "publish" ? "bg-success" :
                    a.type === "ai" ? "bg-primary" :
                    a.type === "error" ? "bg-destructive" :
                    a.type === "change" ? "bg-warning" : "bg-info",
                  ].join(" ")} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm leading-snug">
                      <span className="font-medium">{a.who}</span>{" "}
                      <span className="text-muted-foreground">{a.action}</span>{" "}
                      <span className="font-medium">{a.target}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{a.time}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        {/* Agent jobs */}
        <Card className="mt-6">
          <CardHeader
            title="Agent Jobs đang chạy"
            hint="Theo dõi tiến độ các tác vụ AI"
            action={<Link to="/agent-jobs" className="text-xs font-medium text-primary inline-flex items-center gap-0.5 hover:underline">Mở Agent Studio <ChevronRight className="w-3 h-3" /></Link>}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-muted/50">
                <tr>
                  <th className="text-left font-medium px-5 py-2.5">Tác vụ</th>
                  <th className="text-left font-medium px-3 py-2.5">Nguồn</th>
                  <th className="text-left font-medium px-3 py-2.5">Trạng thái</th>
                  <th className="text-left font-medium px-3 py-2.5 w-48">Tiến độ</th>
                  <th className="text-left font-medium px-5 py-2.5">Bắt đầu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {AGENT_JOBS.map((j) => (
                  <tr key={j.id} className="hover:bg-surface-muted transition">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="grid place-items-center w-7 h-7 rounded-md bg-primary-soft text-primary">
                          <Zap className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="font-medium">{j.task}</div>
                          <div className="text-[11px] text-muted-foreground">→ {j.target} · bởi {j.by}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{j.source}</td>
                    <td className="px-3 py-3"><StatusBadge status={j.status} /></td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full ${j.status === "failed" ? "bg-destructive" : "bg-gradient-brand"}`}
                            style={{ width: `${j.progress}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-muted-foreground tabular-nums">{j.progress}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">{j.started}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </PageContainer>
    </>
  );
}
