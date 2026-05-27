import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Home, FileText, Boxes, DollarSign, HelpCircle, Scroll,
  Image as ImageIcon, Bot, Inbox, GitPullRequest, CheckCheck, History,
  Users, Send, ShieldCheck, Briefcase, MessageSquareQuote,
  Plug, Images, MapPin, ChevronsLeft, Search, Circle, Settings, Ship, BookOpen,
  Layers,
} from "lucide-react";
import { useState } from "react";

type NavItem = { to: string; icon: any; label: string; count?: number; alert?: boolean; matchPrefix?: boolean };
type NavGroup = { label?: string; items: NavItem[] };

const NAV: NavGroup[] = [
  { items: [{ to: "/admin", icon: LayoutDashboard, label: "Bảng điều khiển" }] },
  {
    label: "Nội dung",
    items: [
      { to: "/admin/content/landing", icon: Home, label: "Trang chủ" },
      { to: "/admin/content/services", icon: Boxes, label: "Dịch vụ", matchPrefix: true },
      { to: "/admin/content/service-blocks", icon: Layers, label: "Khối dịch vụ" },
      { to: "/admin/content/faqs", icon: HelpCircle, label: "Câu hỏi thường gặp" },
      { to: "/admin/content/testimonials", icon: MessageSquareQuote, label: "Đánh giá khách hàng" },
      { to: "/admin/content/marketplaces", icon: Plug, label: "Sàn thương mại" },
      { to: "/admin/content/gallery", icon: Images, label: "Banner cuộn trang chủ" },
      { to: "/admin/content/contact", icon: MapPin, label: "Liên hệ & Văn phòng" },
      { to: "/admin/content/blogs", icon: FileText, label: "Bài viết" },
      { to: "/admin/content/careers", icon: Briefcase, label: "Tuyển dụng", matchPrefix: true },
      { to: "/admin/content/policies", icon: Scroll, label: "Chính sách" },
      { to: "/admin/content/shipping-routes", icon: Ship, label: "Tuyến vận chuyển" },
      { to: "/admin/content/media", icon: ImageIcon, label: "Thư viện ảnh" },
    ],
  },
  {
    label: "Sales & Pricing",
    items: [
      { to: "/admin/sales/leads", icon: Inbox, label: "Leads từ landing" },
      { to: "/admin/sales/pricing", icon: DollarSign, label: "Bảng giá", matchPrefix: true },
      { to: "/admin/sales/terminology", icon: BookOpen, label: "Bảng thuật ngữ" },
    ],
  },
  {
    label: "Trợ lý AI",
    items: [
      { to: "/admin/ai/agent-jobs", icon: Bot, label: "Tác vụ AI" },
      { to: "/admin/ai/sources", icon: Inbox, label: "Hộp thư nguồn" },
      { to: "/admin/ai/change-requests", icon: GitPullRequest, label: "Yêu cầu thay đổi" },
      { to: "/admin/ai/reviews", icon: CheckCheck, label: "Chờ duyệt" },
      { to: "/admin/ai/history", icon: History, label: "Lịch sử xuất bản" },
    ],
  },
  {
    label: "Hệ thống",
    items: [
      { to: "/admin/system/users", icon: Users, label: "Người dùng & Phân quyền" },
      { to: "/admin/system/settings", icon: Settings, label: "Cài đặt website" },
      { to: "/admin/system/telegram", icon: Send, label: "Tích hợp Telegram" },
      { to: "/admin/system/audit", icon: ShieldCheck, label: "Lịch sử thay đổi" },
    ],
  },
];

export function CmsSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={[
        "hidden lg:flex shrink-0 flex-col border-r border-sidebar-border bg-gradient-sidebar text-sidebar-foreground transition-[width] duration-200",
        collapsed ? "w-17" : "w-65",
      ].join(" ")}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 h-16 border-b border-sidebar-border">
        <div className="grid place-items-center w-9 h-9 rounded-lg bg-gradient-brand shadow-glow shrink-0">
          <span className="text-white font-bold text-sm tracking-tight">T</span>
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0 leading-tight">
            <div className="font-semibold text-[13px] text-white truncate">THG Content OS</div>
            <div className="text-[10.5px] text-sidebar-foreground/60 truncate">Hệ thống quản trị nội bộ</div>
          </div>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="grid place-items-center w-7 h-7 rounded-md text-sidebar-foreground/50 hover:text-white hover:bg-white/10 transition shrink-0"
          title={collapsed ? "Mở rộng" : "Thu gọn"}
        >
          <ChevronsLeft className={`w-4 h-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* Workspace switcher */}
      {!collapsed && (
        <div className="px-3 pt-3">
          <button className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition">
            <div className="w-6 h-6 rounded-md bg-white/10 grid place-items-center text-[10px] font-bold text-white">VN</div>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-[12px] font-medium text-white truncate">thgfulfill.com</div>
              <div className="text-[10px] text-sidebar-foreground/60 flex items-center gap-1">
                <Circle className="w-1.5 h-1.5 fill-success text-success" />
                Production · v3.2.1
              </div>
            </div>
          </button>
        </div>
      )}

      {/* Search trigger */}
      {!collapsed && (
        <div className="px-3 pt-3">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("cms:open-palette"))}
            className="w-full flex items-center gap-2 px-2.5 h-8 rounded-md bg-black/20 border border-white/5 text-[12px] text-sidebar-foreground/60 hover:text-white hover:border-white/10 transition"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="flex-1 text-left">Tìm kiếm…</span>
            <kbd className="text-[9.5px] font-mono bg-white/10 rounded px-1 py-0.5 text-sidebar-foreground/70">⌘K</kbd>
          </button>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-4 space-y-5 scrollbar-thin">
        {NAV.map((group, gi) => (
          <div key={gi}>
            {group.label && !collapsed && (
              <div className="px-2.5 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/40">
                {group.label}
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = item.matchPrefix
                  ? pathname === item.to || pathname.startsWith(item.to + "/")
                  : pathname === item.to;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    title={collapsed ? item.label : undefined}
                    className={[
                      "group relative flex items-center gap-2.5 rounded-md px-2.5 h-8 text-[13px] transition-all",
                      active
                        ? "bg-white/10 text-white font-medium"
                        : "text-sidebar-foreground/75 hover:bg-white/5 hover:text-white",
                      collapsed ? "justify-center" : "",
                    ].join(" ")}
                  >
                    {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full bg-gradient-brand" />}
                    <Icon className={`w-3.75 h-3.75 shrink-0 ${active ? "text-white" : "text-sidebar-foreground/60 group-hover:text-white"}`} />
                    {!collapsed && (
                      <>
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.count !== undefined && (
                          <span
                            className={[
                              "text-[10px] font-semibold rounded-full px-1.5 py-0.5 min-w-4.5 text-center",
                              item.alert
                                ? "bg-destructive text-white"
                                : active
                                  ? "bg-white/20 text-white"
                                  : "bg-white/10 text-sidebar-foreground/70",
                            ].join(" ")}
                          >
                            {item.count}
                          </span>
                        )}
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      {!collapsed ? (
        <div className="p-3 border-t border-sidebar-border">
          <div className="rounded-lg bg-white/5 border border-white/5 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-[11px] font-semibold text-white">Gói nội bộ</div>
              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-gradient-brand text-white">PRO</span>
            </div>
            <div className="text-[10.5px] text-sidebar-foreground/60 mb-2">Đã dùng 47 / 200 credit AI hôm nay</div>
            <div className="h-1 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-gradient-brand" style={{ width: "23%" }} />
            </div>
          </div>
        </div>
      ) : (
        <div className="p-3 border-t border-sidebar-border grid place-items-center">
          <div className="w-9 h-9 rounded-lg bg-gradient-brand grid place-items-center text-white text-[10px] font-bold">23%</div>
        </div>
      )}
    </aside>
  );
}
