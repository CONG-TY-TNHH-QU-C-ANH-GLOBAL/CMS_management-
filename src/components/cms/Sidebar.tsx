import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Home, FileText, Boxes, DollarSign, HelpCircle, Scroll,
  Image as ImageIcon, Bot, Inbox, GitPullRequest, CheckCheck, History,
  Users, Send, ShieldCheck, Sparkles,
} from "lucide-react";

const NAV: { label?: string; items: { to: string; icon: any; label: string; count?: number; alert?: boolean }[] }[] = [
  { items: [{ to: "/", icon: LayoutDashboard, label: "Dashboard" }] },
  {
    label: "Nội dung",
    items: [
      { to: "/landing", icon: Home, label: "Landing Page" },
      { to: "/blogs", icon: FileText, label: "Blog Posts", count: 7 },
      { to: "/services", icon: Boxes, label: "Services" },
      { to: "/pricing", icon: DollarSign, label: "Pricing", count: 4 },
      { to: "/faqs", icon: HelpCircle, label: "FAQ" },
      { to: "/policies", icon: Scroll, label: "Policies" },
      { to: "/media", icon: ImageIcon, label: "Media Library" },
    ],
  },
  {
    label: "Agent Studio",
    items: [
      { to: "/agent-jobs", icon: Bot, label: "Agent Jobs", count: 3 },
      { to: "/sources", icon: Inbox, label: "Source Inbox" },
      { to: "/change-requests", icon: GitPullRequest, label: "Change Requests", count: 5 },
    ],
  },
  {
    label: "Duyệt nội dung",
    items: [
      { to: "/reviews", icon: CheckCheck, label: "Chờ duyệt", count: 7, alert: true },
      { to: "/history", icon: History, label: "Lịch sử publish" },
    ],
  },
  {
    label: "Cài đặt",
    items: [
      { to: "/users", icon: Users, label: "Users & Roles" },
      { to: "/telegram", icon: Send, label: "Telegram" },
      { to: "/audit", icon: ShieldCheck, label: "Audit Logs" },
    ],
  },
];

export function CmsSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-2.5 px-5 h-16 border-b border-sidebar-border">
        <div className="grid place-items-center w-8 h-8 rounded-lg bg-gradient-brand shadow-glow">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div className="leading-tight">
          <div className="font-semibold text-sm">THG Content OS</div>
          <div className="text-[11px] text-muted-foreground">thgfulfill.com</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {NAV.map((group, gi) => (
          <div key={gi}>
            {group.label && (
              <div className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.to;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={[
                      "group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-all",
                      active
                        ? "bg-sidebar-accent text-foreground font-medium shadow-soft"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-foreground",
                    ].join(" ")}
                  >
                    <Icon className={`w-4 h-4 ${active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
                    <span className="flex-1">{item.label}</span>
                    {item.count !== undefined && (
                      <span
                        className={[
                          "text-[10px] font-semibold rounded-full px-1.5 py-0.5 min-w-[18px] text-center",
                          item.alert
                            ? "bg-destructive text-destructive-foreground"
                            : active
                              ? "bg-primary/15 text-primary"
                              : "bg-muted text-muted-foreground",
                        ].join(" ")}
                      >
                        {item.count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-sidebar-border">
        <div className="rounded-lg bg-gradient-soft p-3">
          <div className="text-xs font-semibold mb-1">Plan: Enterprise</div>
          <div className="text-[11px] text-muted-foreground mb-2">Đã dùng 47 / 200 AI credits hôm nay</div>
          <div className="h-1.5 rounded-full bg-white/60 overflow-hidden">
            <div className="h-full bg-gradient-brand" style={{ width: "23%" }} />
          </div>
        </div>
      </div>
    </aside>
  );
}
