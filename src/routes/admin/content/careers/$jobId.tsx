import { createFileRoute, Link, useParams, useRouter } from "@tanstack/react-router";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { useState } from "react";

import { Card, PageContainer } from "@/components/cms/ui";
import { LocaleTabs, type Locale } from "@/components/cms/LocaleTabs";
import { CareersJobEditor } from "@/features/careers/components/CareersJobEditor";
import {
  getCareersJobDetailFn,
  type CareerLocale,
  type CareersJobRow,
} from "@/features/careers/careers.actions";

export const Route = createFileRoute("/admin/content/careers/$jobId")({
  loader: async ({ params }) => {
    return await getCareersJobDetailFn({ data: { slug: params.jobId } });
  },
  component: JobDetailPage,
});

function JobDetailPage() {
  const { jobId } = useParams({ from: "/admin/content/careers/$jobId" });
  const data = Route.useLoaderData();
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("vi");

  const variants = data.variants as Record<CareerLocale, CareersJobRow | null>;
  const job = variants[locale as CareerLocale];

  return (
    <PageContainer>
      <Link to="/admin/content/careers" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3">
        <ChevronLeft className="w-3.5 h-3.5" /> Quay lại danh sách
      </Link>

      <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">
            {job?.title ?? `(chưa có bản dịch ${locale === "vi" ? "Tiếng Việt" : locale === "en" ? "English" : "中文"})`}
          </h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
            <span>Đường dẫn:</span>
            <span className="font-mono">{jobId}</span>
            <span>•</span>
            <a
              href={`https://thgfulfill.com/careers#${jobId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <ExternalLink className="w-3 h-3" /> Xem trên trang thật
            </a>
          </div>
        </div>
      </div>

      <Card className="overflow-hidden mb-4 p-0">
        <LocaleTabs value={locale} onChange={setLocale} />
      </Card>

      <CareersJobEditor
        key={`${jobId}:${locale}`}
        slug={jobId}
        locale={locale as CareerLocale}
        job={job}
        onSaved={() => router.invalidate()}
      />
    </PageContainer>
  );
}
