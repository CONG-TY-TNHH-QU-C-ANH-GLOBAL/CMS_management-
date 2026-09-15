import { createFileRoute, Link, useParams, useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
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

interface LocaleDetail {
  event: EventRow | null;
  photos: EventPhotoRow[];
  cover_url: string | null;
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

  const details = data.details as Record<EventLocale, LocaleDetail>;
  const detail = details[locale as EventLocale];
  const heading = detail.event?.title ?? details.vi.event?.title ?? slug;

  return (
    <PageContainer>
      <Link
        to="/admin/content/events"
        className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Quay lại danh sách Event
      </Link>

      <div className="mb-5">
        <h2 className="text-xl font-semibold">{heading}</h2>
        <div className="mt-1 text-xs text-muted-foreground">
          Đường dẫn: <span className="font-mono">{slug}</span>
        </div>
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
        onSaved={() => router.invalidate()}
      />
    </PageContainer>
  );
}
