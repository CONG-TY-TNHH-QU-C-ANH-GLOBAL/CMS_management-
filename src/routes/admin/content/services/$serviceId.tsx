import { createFileRoute, Link, notFound, useParams, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ExternalLink, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { LocaleTabs, type Locale } from "@/components/cms/LocaleTabs";
import { Card, CardHeader, PageContainer, StatusBadge } from "@/components/cms/ui";
import { ServiceEditor } from "@/features/content/components/ServiceEditor";
import { ServiceMediaEditor } from "@/features/content/components/ServiceMediaEditor";
import {
  listServicesFn,
  updateServiceBaseFn,
  type ServiceWithI18n,
} from "@/features/content/content.actions";

export const Route = createFileRoute("/admin/content/services/$serviceId")({
  loader: async ({ params }) => {
    const data = await listServicesFn();
    const service = (data.services as ServiceWithI18n[]).find((s) => s.id === params.serviceId);
    if (!service) throw notFound();
    return { service };
  },
  component: ServiceDetail,
});

function ServiceDetail() {
  const { serviceId } = useParams({ from: "/admin/content/services/$serviceId" });
  const data = Route.useLoaderData();
  const router = useRouter();
  const service = data.service as ServiceWithI18n;
  const [locale, setLocale] = useState<Locale>("en");
  const updateBase = useServerFn(updateServiceBaseFn);

  const i18n = service.i18n[locale];
  const bullets = service.bullets[locale] ?? [];

  const [position, setPosition] = useState(service.position);
  const [icon, setIcon] = useState(service.icon ?? "");
  const [status, setStatus] = useState(service.status);
  const [pending, setPending] = useState(false);

  async function saveBase() {
    setPending(true);
    try {
      await updateBase({ data: { id: serviceId, position, icon: icon || null, status } });
      toast.success("Đã lưu cài đặt dịch vụ");
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setPending(false);
    }
  }

  return (
    <PageContainer>
      <Link
        to="/admin/content/services"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> Quay lại danh sách dịch vụ
      </Link>

      <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-3xl">{service.icon}</span>
            <h2 className="text-xl font-semibold">{i18n?.name ?? serviceId}</h2>
            <StatusBadge status={service.status} />
          </div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
            <span>Mã dịch vụ:</span>
            <span className="font-mono">{serviceId}</span>
            <span>•</span>
            <span>Thứ tự: #{service.position}</span>
            {i18n?.cta_url && (
              <>
                <span>•</span>
                <a
                  href={`https://thgfulfill.com${i18n.cta_url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  <ExternalLink className="w-3 h-3" /> Xem trên trang thật
                </a>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Meta editor (locale-agnostic) */}
      <Card className="overflow-hidden mb-4">
        <div className="p-5">
          <CardHeader title="Cài đặt chung" hint="Thứ tự, biểu tượng, trạng thái — áp dụng cho cả 3 bản dịch" />
          <div className="grid sm:grid-cols-3 gap-3 mt-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Thứ tự hiển thị
              </label>
              <input
                type="number"
                min={0}
                value={position}
                onChange={(e) => setPosition(Number(e.target.value))}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Biểu tượng (emoji)
              </label>
              <input
                type="text"
                value={icon}
                maxLength={20}
                onChange={(e) => setIcon(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="📦"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Trạng thái
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
                className="w-full h-9 px-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="draft">Bản nháp</option>
                <option value="live">Đang hiển thị</option>
                <option value="archived">Đã ẩn</option>
              </select>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={saveBase}
              disabled={pending}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {pending ? "Đang lưu..." : "Lưu cài đặt chung"}
            </button>
          </div>
        </div>
      </Card>

      {/* I18n + bullets editor (per locale) */}
      <Card className="overflow-hidden mb-4 p-0">
        <LocaleTabs value={locale} onChange={setLocale} />
      </Card>
      <ServiceEditor
        key={`${serviceId}:${locale}`}
        serviceId={serviceId}
        locale={locale}
        i18n={i18n}
        bullets={bullets}
        onSaved={() => router.invalidate()}
      />

      {/* Service-level (locale-agnostic) media: gallery, videos, products */}
      <div className="mt-6">
        <ServiceMediaEditor
          key={`${serviceId}:media`}
          serviceId={serviceId}
          gallery={service.gallery}
          videos={service.videos}
          products={service.products}
        />
      </div>
    </PageContainer>
  );
}
