import { createFileRoute, Outlet } from "@tanstack/react-router";
import { CmsTopbar } from "@/components/app-shell/Topbar";
import { SubTabs } from "@/components/cms/SubTabs";

export const Route = createFileRoute("/admin/content/services")({
  head: () => ({ meta: [{ title: "Services — THG Content OS" }] }),
  component: ServicesLayout,
});

function ServicesLayout() {
  return (
    <>
      <CmsTopbar title="Dịch vụ" subtitle="4 dịch vụ chính trên thgfulfill.com" />
      <SubTabs
        tabs={[
          { to: "/admin/content/services", label: "Tổng quan" },
          { to: "/admin/content/services/thg-fulfill", label: "THG Fulfill" },
          { to: "/admin/content/services/thg-express", label: "THG Express" },
          { to: "/admin/content/services/thg-warehouse", label: "Kho vận THG" },
          { to: "/admin/content/services/thg-order", label: "THG Dropship" },
        ]}
      />
      <Outlet />
    </>
  );
}
