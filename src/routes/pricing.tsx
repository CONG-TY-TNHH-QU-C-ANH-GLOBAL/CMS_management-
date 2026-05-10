import { createFileRoute, Outlet } from "@tanstack/react-router";
import { CmsTopbar } from "@/components/cms/Topbar";
import { SubTabs } from "@/components/cms/SubTabs";
import { Lock } from "lucide-react";

export const Route = createFileRoute("/pricing")({
  head: () => ({ meta: [{ title: "Pricing — THG Content OS" }] }),
  component: PricingLayout,
});

function PricingLayout() {
  return (
    <>
      <CmsTopbar
        title="Bảng giá"
        subtitle="Bảng giá vận chuyển — chỉ Tài chính & Quản trị tối cao chỉnh được"
        action={
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border border-warning/30 bg-warning/10 text-warning-foreground">
            <Lock className="w-3.5 h-3.5" /> Vùng nhạy cảm
          </span>
        }
      />
      <SubTabs
        tabs={[
          { to: "/pricing", label: "Quốc tế", count: 8 },
          { to: "/pricing/us", label: "Nội địa Mỹ", count: 7 },
          { to: "/pricing/history", label: "Lịch sử thay đổi" },
        ]}
      />
      <Outlet />
    </>
  );
}
