import { createFileRoute } from "@tanstack/react-router";
import { Card, PageContainer, StatusBadge } from "@/components/cms/ui";
import { PRICING_INTL } from "@/lib/cms-mock";
import { Plus, Edit3 } from "lucide-react";

export const Route = createFileRoute("/pricing/")({
  component: PricingIntlPage,
});

function PricingIntlPage() {
  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold">Tuyến quốc tế (THG Express)</h2>
          <p className="text-xs text-muted-foreground">Air freight VN/CN → US/UK/EU</p>
        </div>
        <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 shadow-soft">
          <Plus className="w-4 h-4" /> Thêm tuyến
        </button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-muted/50">
              <tr>
                <th className="text-left font-medium px-5 py-2.5">Tuyến</th>
                <th className="text-left font-medium px-3 py-2.5">Carrier</th>
                <th className="text-left font-medium px-3 py-2.5">Giá từ</th>
                <th className="text-left font-medium px-3 py-2.5">ETA</th>
                <th className="text-left font-medium px-3 py-2.5">Min weight</th>
                <th className="text-left font-medium px-3 py-2.5">Max weight</th>
                <th className="text-left font-medium px-3 py-2.5">Trạng thái</th>
                <th className="px-5 py-2.5 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {PRICING_INTL.map((p) => (
                <tr key={p.id} className="hover:bg-surface-muted transition">
                  <td className="px-5 py-3 font-medium">{p.route}</td>
                  <td className="px-3 py-3 text-xs">{p.carrier}</td>
                  <td className="px-3 py-3 font-mono">{p.from}</td>
                  <td className="px-3 py-3 text-muted-foreground">{p.eta}</td>
                  <td className="px-3 py-3 text-muted-foreground">{p.min}</td>
                  <td className="px-3 py-3 text-muted-foreground">{p.max}</td>
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
