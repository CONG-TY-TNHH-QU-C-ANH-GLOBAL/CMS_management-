import { createFileRoute, Link, useParams, useRouter } from "@tanstack/react-router";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { useState } from "react";

import { Card, PageContainer } from "@/components/cms/ui";
import { LocaleTabs, type Locale } from "@/components/cms/LocaleTabs";
import { ShippingRouteEditor } from "@/features/shipping/components/ShippingRouteEditor";
import {
  getShippingRouteDetailFn,
  type ShippingLocale,
  type ShippingRouteRow,
  type ShippingTableRow,
} from "@/features/shipping/shipping.actions";

export const Route = createFileRoute("/admin/content/shipping-routes/$slug")({
  loader: async ({ params }) => {
    return await getShippingRouteDetailFn({ data: { slug: params.slug } });
  },
  component: ShippingRouteDetailPage,
});

function ShippingRouteDetailPage() {
  const { slug } = useParams({ from: "/admin/content/shipping-routes/$slug" });
  const data = Route.useLoaderData();
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("vi");

  const variants = data.variants as Record<ShippingLocale, ShippingRouteRow | null>;
  const tablesByLocale = data.tables as Record<ShippingLocale, ShippingTableRow[]>;
  const route = variants[locale as ShippingLocale];
  const tables = tablesByLocale[locale as ShippingLocale] ?? [];

  return (
    <PageContainer>
      <Link to="/admin/content/shipping-routes" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3">
        <ChevronLeft className="w-3.5 h-3.5" /> Quay lại danh sách
      </Link>

      <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">{route?.title ?? `(chưa có bản dịch ${locale === "vi" ? "Tiếng Việt" : locale === "en" ? "English" : "中文"})`}</h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
            <span>Đường dẫn:</span>
            <span className="font-mono">{slug}</span>
            <span>•</span>
            <a href="https://thgfulfill.com/shipping-policy" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
              <ExternalLink className="w-3 h-3" /> Xem trên trang thật
            </a>
          </div>
        </div>
      </div>

      <Card className="overflow-hidden mb-4 p-0">
        <LocaleTabs value={locale} onChange={setLocale} />
      </Card>

      <ShippingRouteEditor
        key={`${slug}:${locale}`}
        slug={slug}
        locale={locale as ShippingLocale}
        route={route}
        tables={tables}
        onSaved={() => router.invalidate()}
      />
    </PageContainer>
  );
}
