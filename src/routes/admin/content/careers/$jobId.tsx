import { createFileRoute, Link, useParams, useRouter } from "@tanstack/react-router";
import { ChevronLeft, ExternalLink, Sparkles } from "lucide-react";
import { useState } from "react";

import { Card, PageContainer } from "@/components/cms/ui";
import { LocaleTabs, type Locale } from "@/components/cms/LocaleTabs";
import { CareersJobEditor } from "@/features/careers/components/CareersJobEditor";
import {
  getCareersJobDetailFn,
  type CareerLocale,
  type CareersJobRow,
} from "@/features/careers/careers.actions";
import { TranslationReviewDialog } from "@/features/translations/components/TranslationReviewDialog";
import {
  approveCareersJobTranslationFn,
  deleteCareersJobTranslationFn,
  editCareersJobTranslationFn,
  listCareersJobTranslationsFn,
} from "@/features/translations/translations.actions";

const CAREERS_JOB_FIELDS = [
  { key: "title", label: "Title", rows: 2 },
  { key: "body_md", label: "Body (markdown)", rows: 8 },
  { key: "tagline", label: "Tagline", rows: 2 },
  { key: "salary", label: "Salary", rows: 1 },
  { key: "salary_unit", label: "Salary unit", rows: 1 },
  { key: "salary_note", label: "Salary note", rows: 2 },
  { key: "experience", label: "Experience", rows: 2 },
  { key: "lead", label: "Lead", rows: 3 },
  { key: "responsibilities_json", label: "Responsibilities (JSON)", rows: 5 },
  { key: "requirements_json", label: "Requirements (JSON)", rows: 4 },
  { key: "benefits_json", label: "Benefits (JSON)", rows: 4 },
  { key: "bonuses_json", label: "Bonuses (JSON)", rows: 4 },
] as const;

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
  const [reviewing, setReviewing] = useState<CareersJobRow | null>(null);

  const variants = data.variants as Record<CareerLocale, CareersJobRow | null>;
  const job = variants[locale as CareerLocale];
  const viJob = variants.vi;

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
        {locale === "vi" && viJob ? (
          <button
            onClick={() => setReviewing(viJob)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-blue-300 bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100"
            title="Mở dialog dịch + duyệt EN + ZH cho job này"
          >
            <Sparkles className="w-3.5 h-3.5" /> Bản dịch EN + ZH
          </button>
        ) : null}
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

      {reviewing ? (
        <TranslationReviewDialog
          open={reviewing !== null}
          onOpenChange={(o) => !o && setReviewing(null)}
          onChanged={() => router.invalidate()}
          entityType="careers_job"
          entityId={reviewing.id}
          entityLabel="Job"
          source={{
            title: reviewing.title,
            body_md: reviewing.body_md,
            tagline: reviewing.tagline ?? "",
            salary: reviewing.salary ?? "",
            salary_unit: reviewing.salary_unit ?? "",
            salary_note: reviewing.salary_note ?? "",
            experience: reviewing.experience ?? "",
            lead: reviewing.lead ?? "",
            responsibilities_json: reviewing.responsibilities_json ?? "{}",
            requirements_json: reviewing.requirements_json ?? "[]",
            benefits_json: reviewing.benefits_json ?? "[]",
            bonuses_json: reviewing.bonuses_json ?? "[]",
          }}
          fields={CAREERS_JOB_FIELDS}
          rpcs={{
            list: listCareersJobTranslationsFn,
            approve: approveCareersJobTranslationFn,
            edit: editCareersJobTranslationFn,
            delete: deleteCareersJobTranslationFn,
          }}
          listIdKey="careers_job_id"
        />
      ) : null}
    </PageContainer>
  );
}
