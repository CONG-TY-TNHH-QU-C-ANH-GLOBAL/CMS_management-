import { createFileRoute } from "@tanstack/react-router";
import { CmsTopbar } from "@/components/cms/Topbar";
import { Card, PageContainer, StatusBadge } from "@/components/cms/ui";
import { PRICING } from "@/lib/cms-mock";
import { Plus, Edit3, Lock } from "lucide-react";

export const Route = createFileRoute("/pricing")({
  head: () => ({ meta: [{ title: "Pricing — THG Content OS" }] }),
  component: PricingPage,
});

function PricingPage() {
  return (
    <>
      <CmsTopbar
        title="Pricing"
        subtitle="Bảng giá vận chuyển — chỉ Finance & Super Admin chỉnh được"
        action={
          <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 shadow-soft">
            <Plus className="w-4 h-4" /> Thêm tuyến giá
          </button>
        }
      />
      <PageContainer>
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 mb-4 flex items-start gap-3">
          <div className="grid place-items-center w-8 h-8 rounded-md bg-warning/10 text-warning-foreground"><Lock className="w-4 h-4" /></div>
          <div className="text-xs">
            <div className="font-semibold">Vùng nhạy cảm</div>
            <div className="text-muted-foreground mt-0.5">Mọi thay đổi giá đều cần phê duyệt và sẽ ghi log audit. Effective date được áp dụng tự động.</div>
          </div>
        </div>

        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-muted/50">
                <tr>
                  <th className="text-left font-medium px-5 py-2.5">Tuyến</th>
                  <th className="text-left font-medium px-3 py-2.5">Giá từ</th>
                  <th className="text-left font-medium px-3 py-2.5">Thời gian</th>
                  <th className="text-left font-medium px-3 py-2.5">Min weight</th>
                  <th className="text-left font-medium px-3 py-2.5">Max weight</th>
                  <th className="text-left font-medium px-3 py-2.5">Trạng thái</th>
                  <th className="px-5 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {PRICING.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-muted transition">
                    <td className="px-5 py-3 font-medium">{p.line}</td>
                    <td className="px-3 py-3 font-mono text-foreground">{p.from}</td>
                    <td className="px-3 py-3 text-muted-foreground">{p.time}</td>
                    <td className="px-3 py-3 text-muted-foreground">{p.min}</td>
                    <td className="px-3 py-3 text-muted-foreground">{p.max}</td>
                    <td className="px-3 py-3"><StatusBadge status={p.status} /></td>
                    <td className="px-5 py-3">
                      <button className="grid place-items-center w-7 h-7 rounded-md hover:bg-muted text-muted-foreground">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </PageContainer>
    </>
  );
}
