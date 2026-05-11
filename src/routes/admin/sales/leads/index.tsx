import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Calendar, Inbox, Mail, MapPin, Phone } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { Card, PageContainer } from "@/components/cms/ui";
import {
  listLeadsFn,
  updateLeadStatusFn,
  type LeadRow,
  type LeadStatus,
} from "@/features/leads/leads.actions";

export const Route = createFileRoute("/admin/sales/leads/")({
  head: () => ({ meta: [{ title: "Leads — THG Content OS" }] }),
  loader: () => listLeadsFn(),
  component: LeadsPage,
});

const STATUS_META: Record<LeadStatus, { label: string; color: string }> = {
  new: { label: "Mới", color: "bg-sky-100 text-sky-800 border-sky-300" },
  contacted: { label: "Đã liên hệ", color: "bg-amber-100 text-amber-800 border-amber-300" },
  qualified: { label: "Đủ tiêu chí", color: "bg-violet-100 text-violet-800 border-violet-300" },
  closed: { label: "Đã chốt", color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  spam: { label: "Rác", color: "bg-rose-100 text-rose-800 border-rose-300" },
};

function formatTime(seconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - seconds;
  if (diff < 60) return "vừa xong";
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  return new Date(seconds * 1000).toLocaleString("vi-VN");
}

function LeadsPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const updateStatus = useServerFn(updateLeadStatusFn);
  const [filter, setFilter] = useState<"all" | LeadStatus>("new");
  const [pendingId, setPendingId] = useState<number | null>(null);

  const allLeads = data.leads as LeadRow[];
  const counts = useMemo(() => {
    const c = { all: allLeads.length, new: 0, contacted: 0, qualified: 0, closed: 0, spam: 0 };
    for (const l of allLeads) c[l.status]++;
    return c;
  }, [allLeads]);

  const filtered = filter === "all" ? allLeads : allLeads.filter((l) => l.status === filter);

  async function setStatus(id: number, status: LeadStatus) {
    setPendingId(id);
    try {
      await updateStatus({ data: { id, status } });
      toast.success(`Đã đổi trạng thái → ${STATUS_META[status].label}`);
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Đổi trạng thái thất bại");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <>
      <CmsTopbar
        title="Leads từ landing page"
        subtitle={`${counts.all} tổng · ${counts.new} mới chưa xử lý`}
      />
      <PageContainer>
        <div className="flex flex-wrap gap-2 mb-4">
          {([
            { key: "all", label: `Tất cả (${counts.all})` },
            { key: "new", label: `Mới (${counts.new})` },
            { key: "contacted", label: `Đã liên hệ (${counts.contacted})` },
            { key: "qualified", label: `Qualified (${counts.qualified})` },
            { key: "closed", label: `Closed (${counts.closed})` },
            { key: "spam", label: `Spam (${counts.spam})` },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`h-9 px-3 rounded-lg text-sm font-medium transition ${
                filter === t.key
                  ? "bg-foreground text-background"
                  : "border border-border bg-surface text-foreground hover:bg-surface-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <Card>
          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 mx-auto rounded-full bg-muted grid place-items-center mb-3">
                <Inbox className="w-5 h-5 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-sm mb-1">
                Chưa có lead nào ở filter này
              </h3>
              <p className="text-xs text-muted-foreground">
                Lead mới sẽ xuất hiện khi khách submit form trên landing (POST /api/v1/leads).
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((l) => {
                const meta = STATUS_META[l.status];
                return (
                  <li key={l.id} className="p-4 hover:bg-surface-muted transition">
                    <div className="flex items-start gap-3">
                      <div className="grid place-items-center w-9 h-9 rounded-full bg-gradient-brand text-white text-sm font-semibold shrink-0">
                        {l.name.trim().charAt(0).toUpperCase() || "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{l.name}</span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${meta.color}`}>
                            {meta.label}
                          </span>
                          {l.locale && (
                            <span className="text-[10px] uppercase text-muted-foreground">{l.locale}</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                          <span className="inline-flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            <a href={`mailto:${l.email}`} className="hover:text-foreground">
                              {l.email}
                            </a>
                          </span>
                          {l.phone && (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              <a href={`tel:${l.phone}`} className="hover:text-foreground">
                                {l.phone}
                              </a>
                            </span>
                          )}
                          {l.source_page && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {l.source_page}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatTime(l.created_at)}
                          </span>
                        </div>
                        {l.message && (
                          <div className="mt-2 text-sm text-foreground/80 leading-relaxed border-l-2 border-border pl-3 italic">
                            "{l.message}"
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <select
                          value={l.status}
                          onChange={(e) => setStatus(l.id, e.target.value as LeadStatus)}
                          disabled={pendingId === l.id}
                          className="h-8 px-2 text-xs rounded-md border border-border bg-background disabled:opacity-50"
                        >
                          {(Object.keys(STATUS_META) as LeadStatus[]).map((s) => (
                            <option key={s} value={s}>{STATUS_META[s].label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </PageContainer>
    </>
  );
}
