import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ChevronLeft, Sparkles } from "lucide-react";
import { useState } from "react";

import { Card, PageContainer } from "@/components/cms/ui";
import {
  approveCampaignTranslationFn,
  deleteCampaignTranslationFn,
  editCampaignTranslationFn,
  getCampaignDetailFn,
  listCampaignTranslationsFn,
} from "@/features/campaigns/campaigns.actions";
import { CampaignEditor } from "@/features/campaigns/components/CampaignEditor";
import { TranslationReviewDialog } from "@/features/translations/components/TranslationReviewDialog";

/** Keys must match ENTITY_CONFIG.campaign (translations.service.ts). */
const CAMPAIGN_FIELDS = [
  { key: "title", label: "Tiêu đề", rows: 2 },
  { key: "summary", label: "Tóm tắt", rows: 3 },
  { key: "body_md", label: "Nội dung (Markdown)", rows: 12 },
  { key: "cta_label", label: "Chữ trên nút CTA", rows: 1 },
  { key: "nav_label", label: "Tên trên menu", rows: 1 },
  { key: "menu_items_json", label: "Mục menu (JSON — chỉ dịch title/subtitle)", rows: 8 },
  { key: "seo_title", label: "SEO title", rows: 2 },
  { key: "seo_description", label: "SEO description", rows: 3 },
] as const;

export const Route = createFileRoute("/admin/content/campaigns/$slug")({
  head: () => ({ meta: [{ title: "Chương trình — TH Group Content OS" }] }),
  loader: ({ params }) => getCampaignDetailFn({ data: { slug: params.slug } }),
  component: CampaignDetailPage,
});

function CampaignDetailPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const [reviewing, setReviewing] = useState(false);
  const campaign = data.campaign;

  if (!campaign) {
    return (
      <PageContainer>
        <Card className="p-6 text-sm text-muted-foreground">Không tìm thấy Chương trình.</Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Link
        to="/admin/content/campaigns"
        className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Quay lại danh sách Chương trình
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{campaign.title}</h2>
          <div className="mt-1 text-xs text-muted-foreground">
            Đường dẫn: <span className="font-mono">{campaign.slug}</span>
          </div>
        </div>
        <button
          onClick={() => setReviewing(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-blue-300 bg-blue-50 px-3 text-sm font-medium text-blue-700 hover:bg-blue-100"
          title="Dịch tự động và duyệt bản EN + ZH"
        >
          <Sparkles className="h-3.5 w-3.5" /> Bản dịch EN + ZH
        </button>
      </div>

      <CampaignEditor
        key={campaign.id}
        campaign={campaign}
        coverUrl={data.cover_url}
        ogImageUrl={data.og_image_url}
        onSaved={() => router.invalidate()}
        onDeleted={() => void router.navigate({ to: "/admin/content/campaigns" })}
      />

      {reviewing && (
        <TranslationReviewDialog
          open={reviewing}
          onOpenChange={setReviewing}
          onChanged={() => router.invalidate()}
          entityType="campaign"
          entityId={campaign.id}
          entityLabel="Chương trình"
          source={Object.fromEntries(CAMPAIGN_FIELDS.map(({ key }) => [key, campaign[key] ?? ""]))}
          fields={CAMPAIGN_FIELDS}
          rpcs={{
            list: listCampaignTranslationsFn,
            approve: approveCampaignTranslationFn,
            edit: editCampaignTranslationFn,
            delete: deleteCampaignTranslationFn,
          }}
          listIdKey="campaign_id"
        />
      )}
    </PageContainer>
  );
}
