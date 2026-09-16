import { createFileRoute, Link, useParams, useRouter } from "@tanstack/react-router";
import { ChevronLeft, Sparkles } from "lucide-react";
import { useState } from "react";

import { LocaleTabs, type Locale } from "@/components/cms/LocaleTabs";
import { Card, PageContainer } from "@/components/cms/ui";
import { EventEditor } from "@/features/events/components/EventEditor";
import {
  getEventDetailFn,
  type EventLocale,
  type EventPhotoRow,
  type EventRow,
} from "@/features/events/events.actions";
import { TranslationReviewDialog } from "@/features/translations/components/TranslationReviewDialog";
import {
  approveEventTranslationFn,
  deleteEventTranslationFn,
  editEventTranslationFn,
  listEventTranslationsFn,
} from "@/features/translations/translations.actions";

/** Field schema the review dialog renders. Keys must match the translatable
 *  columns in ENTITY_CONFIG.event (translations.service.ts) — the dialog sends
 *  them straight through to editEventTranslationFn. */
const EVENT_FIELDS = [
  { key: "title", label: "Tiêu đề", rows: 2 },
  { key: "summary", label: "Tóm tắt", rows: 4 },
  { key: "body_md", label: "Nội dung (Markdown)", rows: 14 },
  { key: "location", label: "Địa điểm", rows: 1 },
  { key: "role", label: "Vai trò của THG", rows: 1 },
  { key: "seo_title", label: "SEO title", rows: 2 },
  { key: "seo_description", label: "SEO description", rows: 3 },
] as const;

interface LocaleDetail {
  event: EventRow | null;
  photos: EventPhotoRow[];
  cover_url: string | null;
  og_image_url: string | null;
}

export const Route = createFileRoute("/admin/content/events/$slug")({
  head: () => ({ meta: [{ title: "Event — THG Content OS" }] }),
  // All three locales up front, same as the blog editor: switching tabs is the
  // main interaction here, and a per-tab fetch would make every switch a
  // loading state.
  loader: async ({ params }) => {
    const [en, vi, zh] = await Promise.all([
      getEventDetailFn({ data: { slug: params.slug, locale: "en" } }),
      getEventDetailFn({ data: { slug: params.slug, locale: "vi" } }),
      getEventDetailFn({ data: { slug: params.slug, locale: "zh" } }),
    ]);
    return { slug: params.slug, details: { en, vi, zh } as Record<EventLocale, LocaleDetail> };
  },
  component: EventDetailPage,
});

function EventDetailPage() {
  const { slug } = useParams({ from: "/admin/content/events/$slug" });
  const data = Route.useLoaderData();
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("vi");
  const [reviewing, setReviewing] = useState<EventRow | null>(null);

  const details = data.details as Record<EventLocale, LocaleDetail>;
  const detail = details[locale as EventLocale];
  const heading = detail.event?.title ?? details.vi.event?.title ?? slug;
  // Translations hang off the VI row, so the button only appears there — the
  // same rule the blog editor follows.
  const viEvent = details.vi.event;

  return (
    <PageContainer>
      <Link
        to="/admin/content/events"
        className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Quay lại danh sách Event
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{heading}</h2>
          <div className="mt-1 text-xs text-muted-foreground">
            Đường dẫn: <span className="font-mono">{slug}</span>
          </div>
        </div>
        {locale === "vi" && viEvent ? (
          <button
            onClick={() => setReviewing(viEvent)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-blue-300 bg-blue-50 px-3 text-sm font-medium text-blue-700 hover:bg-blue-100"
            title="Dịch tự động và duyệt bản EN + ZH cho Event này"
          >
            <Sparkles className="h-3.5 w-3.5" /> Bản dịch EN + ZH
          </button>
        ) : null}
      </div>

      <Card className="mb-4 overflow-hidden p-0">
        <LocaleTabs value={locale} onChange={setLocale} />
      </Card>

      <EventEditor
        key={`${slug}:${locale}`}
        slug={slug}
        locale={locale as EventLocale}
        event={detail.event}
        photos={detail.photos}
        coverUrl={detail.cover_url}
        ogImageUrl={detail.og_image_url}
        onSaved={() => router.invalidate()}
      />

      {reviewing ? (
        <TranslationReviewDialog
          open={reviewing !== null}
          onOpenChange={(open) => !open && setReviewing(null)}
          onChanged={() => router.invalidate()}
          entityType="event"
          entityId={reviewing.id}
          entityLabel="Event"
          source={{
            title: reviewing.title,
            summary: reviewing.summary ?? "",
            body_md: reviewing.body_md ?? "",
            location: reviewing.location ?? "",
            role: reviewing.role ?? "",
            seo_title: reviewing.seo_title ?? "",
            seo_description: reviewing.seo_description ?? "",
          }}
          fields={EVENT_FIELDS}
          rpcs={{
            list: listEventTranslationsFn,
            approve: approveEventTranslationFn,
            edit: editEventTranslationFn,
            delete: deleteEventTranslationFn,
          }}
          listIdKey="event_id"
        />
      ) : null}
    </PageContainer>
  );
}
