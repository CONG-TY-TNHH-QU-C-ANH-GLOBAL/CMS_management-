import { createFileRoute } from "@tanstack/react-router";
import { Card, PageContainer, StatusBadge } from "@/components/cms/ui";
import { PRICING_US } from "@/lib/cms-mock";
import { Plus, Edit3, Building2 } from "lucide-react";

export const Route = createFileRoute("/pricing/us")({
  component: PricingUsPage,
});

function PricingUsPage() {
  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold">Pricing nội địa US (THG Warehouse)</h2>
          <p className="text-xs text-muted-foreground">Pick & Pack, storage, FBA prep từ kho PA & NC</p>
        </div>
        <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 shadow-soft">
          <Plus className="w-4 h-4" /> Thêm dịch vụ
        </button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-muted/50">
              <tr>
                <th className="text-left font-medium px-5 py-2.5">Dịch vụ</th>
                <th className="text-left font-medium px-3 py-2.5">Kho</th>
                <th className="text-left font-medium px-3 py-2.5">Giá</th>
                <th className="text-left font-medium px-3 py-2.5">Ghi chú</th>
                <th className="text-left font-medium px-3 py-2.5">Trạng thái</th>
                <th className="px-5 py-2.5 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {PRICING_US.map((p) => (
                <tr key={p.id} className="hover:bg-surface-muted transition">
                  <td className="px-5 py-3 font-medium">{p.service}</td>
                  <td className="px-3 py-3 text-muted-foreground inline-flex items-center gap-1.5"><Building2 className="w-3 h-3" /> {p.warehouse}</td>
                  <td className="px-3 py-3 font-mono">{p.from}</td>
                  <td className="px-3 py-3 text-muted-foreground text-xs">{p.note}</td>
                  <td className="px-3 py-3"><StatusBadge status={p.status} /></td>
                  <td className="px-5 py-3">
                    <button className="grid place-items-center w-7 h-7 rounded-md hover:bg-muted text-muted-foreground"><Edit3 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </PageContainer>
  );
}
