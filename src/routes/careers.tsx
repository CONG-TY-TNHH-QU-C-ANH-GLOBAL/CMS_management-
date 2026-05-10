import { createFileRoute, Outlet } from "@tanstack/react-router";
import { CmsTopbar } from "@/components/cms/Topbar";
import { SubTabs } from "@/components/cms/SubTabs";

export const Route = createFileRoute("/careers")({
  head: () => ({ meta: [{ title: "Tuyển dụng — THG Content OS" }] }),
  component: () => (
    <>
      <CmsTopbar title="Tuyển dụng" subtitle="Quản lý job posts & ứng viên" />
      <SubTabs tabs={[
        { to: "/careers", label: "Vị trí tuyển dụng" },
        { to: "/careers/applicants", label: "Ứng viên" },
      ]} />
      <Outlet />
    </>
  ),
});
