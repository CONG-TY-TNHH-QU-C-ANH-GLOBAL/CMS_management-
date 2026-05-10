import { createFileRoute, Outlet } from "@tanstack/react-router";
import { CmsTopbar } from "@/components/cms/Topbar";
import { SubTabs } from "@/components/cms/SubTabs";

export const Route = createFileRoute("/services")({
  head: () => ({ meta: [{ title: "Services — THG Content OS" }] }),
  component: ServicesLayout,
});

function ServicesLayout() {
  return (
    <>
      <CmsTopbar title="Services" subtitle="3 dịch vụ chính trên thgfulfill.com" />
      <SubTabs
        tabs={[
          { to: "/services", label: "Tổng quan" },
          { to: "/services/thg-fulfill", label: "THG Fulfill" },
          { to: "/services/thg-express", label: "THG Express" },
          { to: "/services/thg-warehouse", label: "THG Warehouse" },
        ]}
      />
      <Outlet />
    </>
  );
}
