import { createFileRoute, Link, useParams, useRouter } from "@tanstack/react-router";
import { ChevronLeft, ExternalLink, Sparkles } from "lucide-react";
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
import { TranslationReviewDialog } from "@/features/translations/components/TranslationReviewDialog";
import {
  approveShippingRouteTranslationFn,
  deleteShippingRouteTranslationFn,
  editShippingRouteTranslationFn,
  listShippingRouteTranslationsFn,
} from "@/features/translations/translations.actions";

const SHIPPING_ROUTE_FIELDS = [
  { key: "title", label: "Title", rows: 2 },
  { key: "body_md", label: "Body (markdown)", rows: 8 },
  { key: "notes_json", label: "Notes (JSON array)", rows: 4 },
] as const;

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
  const [reviewing, setReviewing] = useState<ShippingRouteRow | null>(null);

  const variants = data.variants as Record<ShippingLocale, ShippingRouteRow | null>;
  const tablesByLocale = data.tables as Record<ShippingLocale, ShippingTableRow[]>;
  const route = variants[locale as ShippingLocale];
  const tables = tablesByLocale[locale as ShippingLocale] ?? [];
  const viRoute = variants.vi;

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
        {locale === "vi" && viRoute ? (
          <button
            onClick={() => setReviewing(viRoute)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-blue-300 bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100"
            title="Mở dialog dịch + duyệt EN + ZH cho tuyến vận chuyển này (chỉ dịch title / body / notes; các bảng đính kèm dịch riêng sau)"
          >
            <Sparkles className="w-3.5 h-3.5" /> Bản dịch EN + ZH
          </button>
        ) : null}
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

      {reviewing ? (
        <TranslationReviewDialog
          open={reviewing !== null}
          onOpenChange={(o) => !o && setReviewing(null)}
          onChanged={() => router.invalidate()}
          entityType="shipping_route"
          entityId={reviewing.id}
          entityLabel="Shipping route"
          source={{
            title: reviewing.title,
            body_md: reviewing.body_md ?? "",
            notes_json: reviewing.notes_json ?? "",
          }}
          fields={SHIPPING_ROUTE_FIELDS}
          rpcs={{
            list: listShippingRouteTranslationsFn,
            approve: approveShippingRouteTranslationFn,
            edit: editShippingRouteTranslationFn,
            delete: deleteShippingRouteTranslationFn,
          }}
          listIdKey="shipping_route_id"
        />
      ) : null}
    </PageContainer>
  );
}
