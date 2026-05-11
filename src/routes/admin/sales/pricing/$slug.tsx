import { createFileRoute, Link, notFound, useParams } from "@tanstack/react-router";
import { ChevronLeft, History as HistoryIcon } from "lucide-react";
import { useState } from "react";

import { Card, PageContainer, StatusBadge } from "@/components/cms/ui";
import { PricingSpreadsheetEditor } from "@/features/pricing/components/PricingSpreadsheetEditor";
import {
  getPricingTableFn,
  listPricingVersionsFn,
  type PricingTableRow,
} from "@/features/pricing/pricing.actions";

export const Route = createFileRoute("/admin/sales/pricing/$slug")({
  loader: async ({ params }) => {
    const [tableRes, versionsRes] = await Promise.all([
      getPricingTableFn({ data: { slug: params.slug } }),
      listPricingVersionsFn({ data: { slug: params.slug } }),
    ]);
    if (!tableRes.table) throw notFound();
    return {
      table: tableRes.table as PricingTableRow,
      versions: versionsRes.versions,
    };
  },
  component: PricingDetail,
});

function formatTime(seconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - seconds;
  if (diff < 60) return "vừa xong";
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  return new Date(seconds * 1000).toLocaleString("vi-VN");
}

function PricingDetail() {
  const { slug } = useParams({ from: "/admin/sales/pricing/$slug" });
  const data = Route.useLoaderData();
  const [showHistory, setShowHistory] = useState(false);

  const raw = data.table;
  // Parse JSON cols (D1 returns text). Tolerate one bad field — if schema
  // is malformed JSON we still want to show the rows (and vice versa) so the
  // operator can fix it via the editor instead of seeing a blank page.
  const safeParse = (s: string) => { try { return JSON.parse(s); } catch { return null; } };
  const parsedTable = {
    ...raw,
    schema: safeParse(raw.schema_json) as unknown,
    data: safeParse(raw.data_json) as unknown,
  };

  return (
    <PageContainer>
      <Link
        to="/admin/sales/pricing"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> Quay lại danh sách
      </Link>

      <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">{raw.name}</h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
            <span className="font-mono">{slug}</span>
            <span>•</span>
            <span>kind: {raw.kind}</span>
            <span>•</span>
            <span>v{raw.version}</span>
            <span>•</span>
            <StatusBadge status={raw.status} />
            <span>•</span>
            <span>cập nhật {formatTime(raw.updated_at)}</span>
          </div>
        </div>
        <button
          onClick={() => setShowHistory((s) => !s)}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-surface text-sm font-medium hover:bg-surface-muted"
        >
          <HistoryIcon className="w-4 h-4" /> {showHistory ? "Ẩn" : "Xem"} lịch sử ({data.versions.length})
        </button>
      </div>

      <div className={showHistory ? "grid lg:grid-cols-[1fr_320px] gap-6" : ""}>
        <div className="min-w-0">
          <PricingSpreadsheetEditor table={parsedTable} />
        </div>

        {showHistory && (
          <Card className="p-4 self-start lg:sticky lg:top-20">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Lịch sử thay đổi ({data.versions.length})
            </div>
            {data.versions.length === 0 ? (
              <div className="text-xs text-muted-foreground italic">
                Chưa có version nào. Lần save đầu tiên sẽ snapshot version hiện tại.
              </div>
            ) : (
              <ul className="space-y-2">
                {data.versions.map((v) => (
                  <li
                    key={v.id}
                    className="text-xs border-l-2 border-border pl-3 py-1.5 hover:border-primary transition"
                  >
                    <div className="font-semibold">v{v.version}</div>
                    <div className="text-muted-foreground mt-0.5">{formatTime(v.created_at)}</div>
                    {v.comment ? (
                      <div className="mt-1 italic text-foreground/80">"{v.comment}"</div>
                    ) : (
                      <div className="mt-1 italic text-muted-foreground/60">(không có ghi chú)</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
