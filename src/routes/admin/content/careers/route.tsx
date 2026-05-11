import { createFileRoute, Outlet } from "@tanstack/react-router";
import { CmsTopbar } from "@/components/app-shell/Topbar";
import { SubTabs } from "@/components/cms/SubTabs";

export const Route = createFileRoute("/admin/content/careers")({
  head: () => ({ meta: [{ title: "Tuyển dụng — THG Content OS" }] }),
  component: () => (
    <>
      <CmsTopbar title="Tuyển dụng" subtitle="Quản lý tin tuyển dụng & ứng viên" />
      <SubTabs tabs={[
        { to: "/admin/content/careers", label: "Vị trí tuyển dụng" },
        { to: "/admin/content/careers/applicants", label: "Ứng viên" },
      ]} />
      <Outlet />
    </>
  ),
});
