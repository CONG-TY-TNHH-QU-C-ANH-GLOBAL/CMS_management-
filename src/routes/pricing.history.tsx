import { createFileRoute } from "@tanstack/react-router";
import { Card, PageContainer } from "@/components/cms/ui";
import { TrendingUp, TrendingDown } from "lucide-react";

export const Route = createFileRoute("/pricing/history")({
  component: PricingHistory,
});

const HISTORY = [
  { date: "01/03/2026", item: "VN→US East", before: "$4.00", after: "$4.20", diff: "+5%", up: true, by: "Hoa Lê" },
  { date: "01/02/2026", item: "Epacket VN→US", before: "$8.20", after: "$8.50", diff: "+3.6%", up: true, by: "Khôi Vũ" },
  { date: "15/01/2026", item: "Pick & Pack 1 SKU", before: "$1.30", after: "$1.20", diff: "-7.7%", up: false, by: "Hoa Lê" },
  { date: "01/01/2026", item: "DHL Express US", before: "$24.00", after: "$22.00", diff: "-8.3%", up: false, by: "Hoa Lê" },
  { date: "15/12/2025", item: "VN→UK", before: "$5.00", after: "$5.20", diff: "+4%", up: true, by: "Khôi Vũ" },
];

function PricingHistory() {
  return (
    <PageContainer>
      <h2 className="font-semibold mb-1">Lịch sử thay đổi giá</h2>
      <p className="text-xs text-muted-foreground mb-4">Mọi điều chỉnh được audit và áp dụng theo effective date.</p>
      <Card>
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-muted/50">
            <tr>
              <th className="text-left font-medium px-5 py-2.5">Ngày áp dụng</th>
              <th className="text-left font-medium px-3 py-2.5">Tuyến / dịch vụ</th>
              <th className="text-left font-medium px-3 py-2.5">Trước</th>
              <th className="text-left font-medium px-3 py-2.5">Sau</th>
              <th className="text-left font-medium px-3 py-2.5">Chênh</th>
              <th className="text-left font-medium px-5 py-2.5">Người publish</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {HISTORY.map((h, i) => (
              <tr key={i} className="hover:bg-surface-muted transition">
                <td className="px-5 py-3 font-mono text-xs">{h.date}</td>
                <td className="px-3 py-3 font-medium">{h.item}</td>
                <td className="px-3 py-3 font-mono line-through text-muted-foreground">{h.before}</td>
                <td className="px-3 py-3 font-mono font-semibold">{h.after}</td>
                <td className="px-3 py-3">
                  <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${h.up ? "text-destructive" : "text-success"}`}>
                    {h.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {h.diff}
                  </span>
                </td>
                <td className="px-5 py-3 text-xs">{h.by}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </PageContainer>
  );
}
