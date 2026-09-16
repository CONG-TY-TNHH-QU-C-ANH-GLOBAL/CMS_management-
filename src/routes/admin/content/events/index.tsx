import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, MapPin, PlayCircle, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { ConfirmDialog } from "@/components/cms/ConfirmDialog";
import { Card, PageContainer } from "@/components/cms/ui";
import { NewEventDialog } from "@/features/events/components/NewEventDialog";
import { BulkTranslateButton } from "@/features/translations/components/BulkTranslateButton";
import {
  deleteEventSlugFn,
  listEventsFn,
  type EventLocale,
  type EventRow,
} from "@/features/events/events.actions";

export const Route = createFileRoute("/admin/content/events/")({
  head: () => ({ meta: [{ title: "Event — THG Content OS" }] }),
  loader: () => listEventsFn(),
  component: EventsPage,
});

const LOCALE_ORDER: EventLocale[] = ["vi", "en", "zh"];

interface EventGroup {
  slug: string;
  /** The row the list row renders from: VI when it exists, otherwise whatever
   *  locale does. A group always has at least one variant. */
  ref: EventRow;
  variants: EventRow[];
  liveCount: number;
}

function groupBySlug(events: EventRow[]): EventGroup[] {
  const bySlug = new Map<string, EventRow[]>();
  for (const event of events) {
    const bucket = bySlug.get(event.slug) ?? [];
    bucket.push(event);
    bySlug.set(event.slug, bucket);
  }
  return [...bySlug.values()]
    .map((variants) => {
      const ref = variants.find((v) => v.locale === "vi") ?? variants[0];
      return {
        slug: ref.slug,
        ref,
        variants,
        liveCount: variants.filter((v) => v.status === "live").length,
      };
    })
    .sort((a, b) => b.ref.event_date.localeCompare(a.ref.event_date));
}

function formatDate(date: string | null): string {
  if (!date) return "—";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("vi-VN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function EventsPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<EventGroup | null>(null);
  const del = useServerFn(deleteEventSlugFn);

  const groups = useMemo(() => groupBySlug(data.events as EventRow[]), [data.events]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.slug.toLowerCase().includes(q) ||
        g.variants.some((v) => v.title.toLowerCase().includes(q)),
    );
  }, [groups, search]);

  const liveTotal = groups.filter((g) => g.liveCount > 0).length;

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await del({ data: { slug: confirmDelete.slug } });
      toast.success("Đã xóa Event (tất cả ngôn ngữ)");
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xóa thất bại");
    }
  }

  return (
    <>
      <CmsTopbar
        title="Event"
        subtitle={`${groups.length} Event — ${liveTotal} đang hiển thị trên landing`}
        action={
          <button
            onClick={() => setNewOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3 text-sm font-medium text-background shadow-soft transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Event mới
          </button>
        }
      />
      <PageContainer>
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <div className="flex h-9 min-w-48 flex-1 items-center gap-2 rounded-lg border border-border bg-surface-muted px-3 text-sm">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm theo tên Event hoặc đường dẫn…"
                className="flex-1 bg-transparent outline-none"
              />
            </div>
            <BulkTranslateButton entityType="event" onDone={() => router.invalidate()} />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 text-left font-medium">Event</th>
                  <th className="px-3 py-2.5 text-left font-medium">Ngày</th>
                  <th className="px-3 py-2.5 text-left font-medium">Vai trò</th>
                  <th className="px-3 py-2.5 text-left font-medium">Ngôn ngữ</th>
                  <th className="w-16 px-5 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-12 text-center text-sm text-muted-foreground"
                    >
                      {groups.length === 0
                        ? "Chưa có Event nào. Bấm “Event mới” để bắt đầu."
                        : "Không tìm thấy Event khớp từ khóa."}
                    </td>
                  </tr>
                )}
                {filtered.map((group) => (
                  <tr key={group.slug} className="group transition hover:bg-surface-muted">
                    <td className="px-5 py-3">
                      <Link
                        to="/admin/content/events/$slug"
                        params={{ slug: group.slug }}
                        className="block"
                      >
                        <div className="flex items-center gap-2 font-medium">
                          {group.ref.title}
                          {group.ref.video_url && (
                            <PlayCircle
                              className="h-3.5 w-3.5 text-muted-foreground"
                              aria-label="Có video"
                            />
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                          {group.slug}
                          {group.ref.location && (
                            <span className="inline-flex items-center gap-1 font-sans">
                              <MapPin className="h-3 w-3" />
                              {group.ref.location}
                            </span>
                          )}
                        </div>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {formatDate(group.ref.event_date)}
                      </span>
                      {group.ref.end_date && (
                        <div className="text-[11px]">→ {formatDate(group.ref.end_date)}</div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{group.ref.role ?? "—"}</td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1">
                        {LOCALE_ORDER.map((locale) => {
                          const variant = group.variants.find((v) => v.locale === locale);
                          const live = variant?.status === "live";
                          return (
                            <span
                              key={locale}
                              title={
                                !variant
                                  ? `Chưa có bản ${locale.toUpperCase()}`
                                  : live
                                    ? `${locale.toUpperCase()} đang hiển thị`
                                    : `${locale.toUpperCase()} còn là nháp`
                              }
                              className={[
                                "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                                !variant
                                  ? "border border-dashed border-border text-muted-foreground/50"
                                  : live
                                    ? "bg-success/15 text-success"
                                    : "bg-muted text-muted-foreground",
                              ].join(" ")}
                            >
                              {locale}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => setConfirmDelete(group)}
                        className="rounded-md p-1.5 text-muted-foreground opacity-0 transition hover:bg-muted hover:text-red-600 group-hover:opacity-100"
                        title="Xóa Event (tất cả ngôn ngữ)"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </PageContainer>

      <NewEventDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(slug) => {
          void router.navigate({ to: "/admin/content/events/$slug", params: { slug } });
        }}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title="Xóa Event?"
        description={`“${confirmDelete?.ref.title ?? ""}” sẽ bị xóa ở cả 3 ngôn ngữ, kèm thư viện ảnh của Event. Không thể hoàn tác.`}
        confirmLabel="Xóa"
        destructive
        onConfirm={handleDelete}
      />
    </>
  );
}
