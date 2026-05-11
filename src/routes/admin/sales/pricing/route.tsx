import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Lock } from "lucide-react";

import { CmsTopbar } from "@/components/app-shell/Topbar";

export const Route = createFileRoute("/admin/sales/pricing")({
  head: () => ({ meta: [{ title: "Bảng giá — THG Content OS" }] }),
  component: PricingLayout,
});

function PricingLayout() {
  return (
    <>
      <CmsTopbar
        title="Bảng giá"
        subtitle="Bảng giá vận chuyển — chỉ Admin/Editor + Tài chính được sửa. Mỗi lần lưu hệ thống tự động lưu phiên bản cũ để có thể khôi phục."
        action={
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border border-amber-300 bg-amber-100 text-amber-800">
            <Lock className="w-3.5 h-3.5" /> Vùng nhạy cảm
          </span>
        }
      />
      <Outlet />
    </>
  );
}
