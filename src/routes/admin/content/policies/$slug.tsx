import { createFileRoute, Link, useParams, useRouter } from "@tanstack/react-router";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { useState } from "react";

import { Card, PageContainer } from "@/components/cms/ui";
import { LocaleTabs, type Locale } from "@/components/cms/LocaleTabs";
import { PolicyEditor } from "@/features/policies/components/PolicyEditor";
import {
  getPolicyDetailFn,
  type PolicyLocale,
  type PolicyRow,
} from "@/features/policies/policies.actions";

export const Route = createFileRoute("/admin/content/policies/$slug")({
  loader: async ({ params }) => {
    return await getPolicyDetailFn({ data: { slug: params.slug } });
  },
  component: PolicyDetailPage,
});

function PolicyDetailPage() {
  const { slug } = useParams({ from: "/admin/content/policies/$slug" });
  const data = Route.useLoaderData();
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("vi");

  const variants = data.variants as Record<PolicyLocale, PolicyRow | null>;
  const policy = variants[locale as PolicyLocale];

  return (
    <PageContainer>
      <Link to="/admin/content/policies" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3">
        <ChevronLeft className="w-3.5 h-3.5" /> Quay lại danh sách
      </Link>

      <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">{policy?.title ?? `(chưa có bản dịch ${locale === "vi" ? "Tiếng Việt" : locale === "en" ? "English" : "中文"})`}</h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
            <span>Đường dẫn:</span>
            <span className="font-mono">{slug}</span>
            <span>•</span>
            <a href={`https://thgfulfill.com/policy`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
              <ExternalLink className="w-3 h-3" /> Xem trên trang thật
            </a>
          </div>
        </div>
      </div>

      <Card className="overflow-hidden mb-4 p-0">
        <LocaleTabs value={locale} onChange={setLocale} />
      </Card>

      <PolicyEditor
        key={`${slug}:${locale}`}
        slug={slug}
        locale={locale as PolicyLocale}
        policy={policy}
        onSaved={() => router.invalidate()}
      />
    </PageContainer>
  );
}
