import { createServerFn } from "@tanstack/react-start";

export type { DashboardSummary } from "@/features/dashboard";

export const getDashboardSummaryFn = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSession } = await import("@/features/auth");
  const { getDashboardSummary } = await import("@/features/dashboard");
  await requireSession("viewer");
  return await getDashboardSummary();
});
