import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Boxes,
  DollarSign,
  FileText,
  HelpCircle,
  Image as ImageIcon,
  Inbox,
  Languages,
  MapPin,
  MessageSquareQuote,
  Sparkles,
  Users as UsersIcon,
} from "lucide-react";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { Card, CardHeader, PageContainer } from "@/components/cms/ui";
import { getDashboardSummaryFn, type DashboardSummary } from "@/features/dashboard/dashboard.actions";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "Dashboard — THG Content OS" }] }),
  loader: () => getDashboardSummaryFn(),
  component: Dashboard,
});

function Dashboard() {
  const summary = Route.useLoaderData() as DashboardSummary;
  const ctx = Route.useRouteContext();
  const userName = ctx.user?.name?.split(" ")[0] ?? "bạn";

  return (
    <>
      <CmsTopbar title="Bảng điều khiển" subtitle="Tổng quan nội dung CMS" />
      <PageContainer>
        {/* Hero greeting */}
        <section className="relative overflow-hidden rounded-2xl bg-gradient-hero border border-border p-6 sm:p-8 mb-6">
          <div
            className="absolute inset-0 opacity-40 pointer-events-none"
            style={{ background: "radial-gradient(600px 200px at 80% 0%, oklch(0.85 0.15 280 / 0.4), transparent)" }}
          />
          <div className="relative flex flex-col md:flex-row md:items-end gap-6 justify-between">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border border-border bg-surface/70 backdrop-blur mb-3">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                Chào {userName}
              </div>
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight max-w-xl">
                <span className="text-gradient">{summary.translations.toLocaleString("vi-VN")}</span> dòng dịch
                {" • "}
                <span className="text-gradient">{summary.pricing_tables}</span> bảng giá
                {" • "}
                <span className="text-gradient">{summary.services}</span> dịch vụ đang quản lý
              </h2>
              <p className="text-sm text-muted-foreground mt-2 max-w-lg">
                Toàn bộ nội dung landing page hiện đã nằm trong D1. Vận hành sửa trực tiếp qua các trang admin bên trái.
              </p>
            </div>
          </div>
        </section>

        {/* Content stats — real D1 counts */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard label="Translations" value={summary.translations} sub="key × locale" icon={Languages} to="/admin/content/landing" />
          <StatCard label="Services" value={summary.services} sub="card hiển thị homepage" icon={Boxes} to="/admin/content/services" />
          <StatCard label="FAQs (home)" value={summary.faqs} sub="câu hỏi × 3 ngôn ngữ" icon={HelpCircle} to="/admin/content/faqs" />
          <StatCard label="Testimonials" value={summary.testimonials} sub="review hiển thị" icon={MessageSquareQuote} to="/admin/content/testimonials" />
          <StatCard label="Pricing tables" value={summary.pricing_tables} sub="bảng giá vận chuyển" icon={DollarSign} to="/admin/sales/pricing" />
          <StatCard label="Contact locations" value={summary.contact_locations} sub="văn phòng + kho + liên hệ" icon={MapPin} to="/admin/content/contact" />
          <StatCard label="Media items" value={summary.media} sub="ảnh trong R2 + external" icon={ImageIcon} to="/admin/content/gallery" />
          <StatCard label="Users active" value={summary.users_active} sub="thành viên đang dùng CMS" icon={UsersIcon} to="/admin/system/users" />
        </section>

        {/* Two columns: leads + content health */}
        <section className="grid lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader
              title="Leads mới chưa xử lý"
              hint="Form submissions thay nút Get Started → facebook.com (audit P0.6)"
              action={
                <Link to="/admin/system/users" className="text-xs font-medium text-primary inline-flex items-center gap-0.5 hover:underline">
                  Xem tất cả <ArrowRight className="w-3 h-3" />
                </Link>
              }
            />
            {summary.leads_new === 0 ? (
              <div className="px-5 py-12 text-center">
                <div className="w-10 h-10 mx-auto rounded-full bg-muted grid place-items-center mb-2">
                  <Inbox className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="text-sm text-muted-foreground">
                  Chưa có lead nào. Lead form sẽ build ở Step 6 (thay nút "Get Started" cũ).
                </div>
              </div>
            ) : (
              <div className="px-5 py-3 text-sm">
                {summary.leads_new} lead chưa xử lý. (UI list — Step 6)
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Trạng thái sẵn sàng" hint="Audit findings progress" />
            <ul className="px-5 py-3 space-y-2 text-sm">
              <HealthRow label="i18n migrated" ok subtitle={`${summary.translations.toLocaleString("vi-VN")} rows`} />
              <HealthRow label="Pricing tables" ok subtitle={`${summary.pricing_tables} bảng`} />
              <HealthRow label="Services + FAQs + Testimonials" ok subtitle="seeded" />
              <HealthRow label="Contact + Marquee + Integrations" ok subtitle="seeded" />
              <HealthRow label="Public landing (SSR)" pending subtitle="Step 5c" />
              <HealthRow label="Lead form + Sitemap" pending subtitle="Step 6" />
              <HealthRow label="Tracking + JSON-LD" pending subtitle="Step 8" />
            </ul>
          </Card>
        </section>

        <Card className="mt-6 p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 grid place-items-center shrink-0">
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-sm">Kế hoạch phát triển CMS</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Tham khảo plan đầy đủ tại <code className="font-mono px-1 rounded bg-muted">~/.claude/plans/nghe-n-y-t-ang-hidden-bunny.md</code> — gồm audit findings (21 issues), audit-to-CMS mapping, status snapshot.
              </div>
            </div>
          </div>
        </Card>
      </PageContainer>
    </>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  to,
}: {
  label: string;
  value: number;
  sub: string;
  icon: typeof Languages;
  to: string;
}) {
  return (
    <Link to={to as "/admin"} className="block group">
      <Card className="p-4 hover:shadow-elevated hover:border-primary/30 transition h-full">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 grid place-items-center text-primary">
            <Icon className="w-4 h-4" />
          </div>
          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</div>
        </div>
        <div className="text-2xl font-semibold tracking-tight">{value.toLocaleString("vi-VN")}</div>
        <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>
      </Card>
    </Link>
  );
}

function HealthRow({ label, ok, pending, subtitle }: { label: string; ok?: boolean; pending?: boolean; subtitle?: string }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span
          className={[
            "w-1.5 h-1.5 rounded-full",
            ok ? "bg-success" : pending ? "bg-warning" : "bg-muted-foreground",
          ].join(" ")}
        />
        <span className={ok ? "text-foreground" : "text-muted-foreground"}>{label}</span>
      </div>
      {subtitle && <span className="text-[11px] text-muted-foreground">{subtitle}</span>}
    </li>
  );
}
