import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Grid3x3, KeyRound } from "lucide-react";

import { Card, PageContainer, StatusBadge } from "@/components/cms/ui";
import {
  listPricingTablesFn,
  type PricingCategory,
  type PricingTableSummary,
} from "@/features/pricing/pricing.actions";

export const Route = createFileRoute("/admin/sales/pricing/")({
  loader: () => listPricingTablesFn(),
  component: PricingIndex,
});

function formatTime(seconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - seconds;
  if (diff < 60) return "vừa xong";
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  return `${Math.floor(diff / 86400)} ngày trước`;
}

function PricingIndex() {
  const data = Route.useLoaderData();
  const categories = data.categories as PricingCategory[];
  const totalTables = categories.reduce((sum, c) => sum + c.tables.length, 0);

  return (
    <PageContainer>
      <div className="text-xs text-muted-foreground mb-4">
        {totalTables} bảng giá trong {categories.length} nhóm. Click vào bảng để mở spreadsheet
        editor.
      </div>

      <div className="space-y-6">
        {categories.map((cat) => (
          <div key={cat.name}>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {cat.name}
              </h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                {cat.tables.length}
              </span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {cat.tables.map((t) => (
                <PricingCard key={t.id} table={t} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </PageContainer>
  );
}

function PricingCard({ table }: { table: PricingTableSummary }) {
  const isGrid = table.kind === "weight_grid";
  return (
    <Link to="/admin/sales/pricing/$slug" params={{ slug: table.slug }} className="block group">
      <Card className="p-4 hover:shadow-elevated hover:border-primary/30 transition h-full">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${isGrid ? "bg-primary/10 text-primary" : "bg-accent/10 text-accent-foreground"}`}
            >
              {isGrid ? <Grid3x3 className="w-4 h-4" /> : <KeyRound className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-sm leading-tight truncate">{table.name}</div>
              <div className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">
                {table.slug}
              </div>
            </div>
          </div>
          <StatusBadge status={table.status} />
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs mb-3">
          <div>
            <div className="text-muted-foreground">{isGrid ? "Rows" : "Keys"}</div>
            <div className="font-semibold mt-0.5">{table.row_count}</div>
          </div>
          {isGrid && (
            <div>
              <div className="text-muted-foreground">Cols</div>
              <div className="font-semibold mt-0.5">{table.col_count}</div>
            </div>
          )}
          {!isGrid && (
            <div>
              <div className="text-muted-foreground">Type</div>
              <div className="font-semibold mt-0.5">Meta KV</div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t border-border pt-2.5">
          <span>
            v{table.version} · {formatTime(table.updated_at)}
          </span>
          <span className="inline-flex items-center gap-0.5 text-primary group-hover:gap-1 transition-all font-medium">
            Mở <ArrowRight className="w-3 h-3" />
          </span>
        </div>
      </Card>
    </Link>
  );
}
