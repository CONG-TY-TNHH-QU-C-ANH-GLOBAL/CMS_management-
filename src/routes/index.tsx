import { createFileRoute, redirect } from "@tanstack/react-router";

// cmsthgfulfill chỉ là CMS admin + REST API.
// Public landing sống ở repo THG_landingpage (deploy riêng).
// Truy cập / → vào admin.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin" });
  },
});
