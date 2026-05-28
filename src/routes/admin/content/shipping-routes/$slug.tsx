import { createFileRoute, Link, useParams, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ExternalLink, Languages } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Card, PageContainer } from "@/components/cms/ui";
import { LocaleTabs, type Locale } from "@/components/cms/LocaleTabs";
import { ShippingRouteEditor } from "@/features/shipping/components/ShippingRouteEditor";
import {
  enqueueShippingTranslateFn,
  getShippingRouteDetailFn,
  type ShippingLocale,
  type ShippingRouteRow,
  type ShippingTableRow,
} from "@/features/shipping/shipping.actions";
import {
  getTranslationJobFn,
  pumpTranslationJobFn,
} from "@/features/translations/translations.actions";

const LOCALE_LABEL: Record<ShippingLocale, string> = {
  en: "English",
  vi: "Tiếng Việt",
  zh: "中文",
};

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
  const [translating, setTranslating] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const enqueueTranslate = useServerFn(enqueueShippingTranslateFn);
  const pumpJob = useServerFn(pumpTranslationJobFn);
  const getJob = useServerFn(getTranslationJobFn);

  const variants = data.variants as Record<ShippingLocale, ShippingRouteRow | null>;
  const tablesByLocale = data.tables as Record<ShippingLocale, ShippingTableRow[]>;
  const route = variants[locale as ShippingLocale];
  const tables = tablesByLocale[locale as ShippingLocale] ?? [];

  const otherLocales = (["en", "vi", "zh"] as ShippingLocale[]).filter((l) => l !== locale);
  const hasSourceBody = !!route?.body_md?.trim();

  async function onTranslate() {
    if (!hasSourceBody) {
      toast.error("Nội dung ở tab hiện tại đang trống — không có gì để dịch.");
      return;
    }
    setTranslating(true);
    setProgress(null);
    const src = locale as ShippingLocale;
    try {
      // Enqueue an async job (chunks persisted to D1), then drive it pass-by-pass
      // from the browser. Each pump translates a batch and saves immediately, so
      // closing the tab never loses progress — the 1-min Cron resumes the rest.
      const { jobId, totalChunks, skipped } = await enqueueTranslate({
        data: { slug, source_locale: src, target_locales: otherLocales },
      });
      if (skipped || !jobId) {
        toast.error("Không có nội dung để dịch.");
        return;
      }
      setProgress({ done: 0, total: totalChunks });
      toast.message(`Đã tạo job dịch ${LOCALE_LABEL[src]} → ${otherLocales.map((l) => LOCALE_LABEL[l]).join(" + ")} (${totalChunks} phần).`);

      let safety = 400;
      while (safety-- > 0) {
        let job;
        try {
          ({ job } = await pumpJob({ data: { jobId } }));
        } catch {
          // A pump request can time out at the gateway on a slow batch — the
          // chunks it completed are already persisted. Fall back to a status
          // read and let the Cron pass keep advancing the job.
          ({ job } = await getJob({ data: { jobId } }));
          await new Promise((r) => setTimeout(r, 3000));
        }
        if (!job) break;
        setProgress({ done: job.done_chunks, total: job.total_chunks });
        if (job.status === "completed" || job.status === "partial" || job.status === "failed") {
          if (job.status === "completed") {
            toast.success(`Đã dịch xong (${job.done_chunks}/${job.total_chunks} phần).`);
          } else if (job.status === "partial") {
            toast.warning(`Dịch xong một phần: ${job.done_chunks}/${job.total_chunks}, ${job.failed_chunks} phần lỗi (Cron sẽ thử lại).`);
          } else {
            toast.error("Dịch thất bại — Cron sẽ tự thử lại sau.");
          }
          await router.invalidate();
          break;
        }
      }
    } catch (err) {
      toast.error(`Không tạo được job dịch: ${err instanceof Error ? err.message : "lỗi"}`);
    } finally {
      setTranslating(false);
      setProgress(null);
    }
  }

  return (
    <PageContainer>
      <Link to="/admin/content/shipping-routes" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3">
        <ChevronLeft className="w-3.5 h-3.5" /> Quay lại danh sách
      </Link>

      <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">{route?.title ?? `(chưa có bản dịch ${LOCALE_LABEL[locale as ShippingLocale]})`}</h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
            <span>Đường dẫn:</span>
            <span className="font-mono">{slug}</span>
            <span>•</span>
            <a href="https://thgfulfill.com/shipping-policy" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
              <ExternalLink className="w-3 h-3" /> Xem trên trang thật
            </a>
          </div>
        </div>
        <button
          onClick={onTranslate}
          disabled={translating || !hasSourceBody}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-blue-300 bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
          title={
            hasSourceBody
              ? `Dùng AI dịch nội dung ${LOCALE_LABEL[locale as ShippingLocale]} hiện tại sang ${otherLocales.map((l) => LOCALE_LABEL[l]).join(" + ")} (ghi đè nội dung 2 tab kia)`
              : "Tab hiện tại chưa có nội dung để dịch"
          }
        >
          <Languages className="w-3.5 h-3.5" />
          {translating
            ? progress
              ? `Đang dịch… ${progress.done}/${progress.total}`
              : "Đang tạo job…"
            : `Dịch ${LOCALE_LABEL[locale as ShippingLocale]} → ${otherLocales.map((l) => LOCALE_LABEL[l]).join(" + ")}`}
        </button>
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
