import { createFileRoute } from "@tanstack/react-router";
import { ChevronRight, ShieldCheck, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { Card, PageContainer } from "@/components/cms/ui";
import {
  listAuditLogFn,
  type AuditLogRow,
  type AuditAction,
} from "@/features/audit/audit.actions";

const PAGE_SIZE = 50;

export const Route = createFileRoute("/admin/system/audit/")({
  head: () => ({ meta: [{ title: "Lịch sử thay đổi — THG Content OS" }] }),
  loader: () => listAuditLogFn({ data: { limit: PAGE_SIZE, offset: 0 } }),
  component: AuditPage,
});

const ACTION_LABEL: Record<AuditAction, string> = {
  create: "Tạo mới",
  update: "Sửa",
  delete: "Xóa",
  reorder: "Sắp xếp lại",
  publish: "Xuất bản",
  rollback: "Khôi phục",
};

const ACTION_COLOR: Record<AuditAction, string> = {
  create: "bg-emerald-100 text-emerald-800 border-emerald-300",
  update: "bg-sky-100 text-sky-800 border-sky-300",
  delete: "bg-rose-100 text-rose-800 border-rose-300",
  reorder: "bg-violet-100 text-violet-800 border-violet-300",
  publish: "bg-amber-100 text-amber-800 border-amber-300",
  rollback: "bg-muted text-muted-foreground border-border",
};

function formatTime(sec: number): string {
  const diff = Math.floor(Date.now() / 1000) - sec;
  if (diff < 60) return "vừa xong";
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} ngày trước`;
  return new Date(sec * 1000).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function AuditPage() {
  const initial = Route.useLoaderData();
  const [rows, setRows] = useState<AuditLogRow[]>(initial.rows);
  const [total, setTotal] = useState(initial.total);
  const [facets] = useState(initial.facets);
  const [offset, setOffset] = useState(0);
  const [filterActor, setFilterActor] = useState<number | null>(null);
  const [filterAction, setFilterAction] = useState<AuditAction | null>(null);
  const [filterEntity, setFilterEntity] = useState<string | null>(null);
  const [filterDays, setFilterDays] = useState<number | null>(null);
  const [viewing, setViewing] = useState<AuditLogRow | null>(null);

  async function reload(nextOffset = 0) {
    const since = filterDays ? Math.floor(Date.now() / 1000) - filterDays * 86400 : null;
    const data = await listAuditLogFn({
      data: {
        limit: PAGE_SIZE,
        offset: nextOffset,
        actor_id: filterActor,
        action: filterAction,
        entity: filterEntity,
        since,
      },
    });
    setRows(data.rows);
    setTotal(data.total);
    setOffset(nextOffset);
  }

  useEffect(() => {
    reload(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterActor, filterAction, filterEntity, filterDays]);

  const hasFilter = filterActor !== null || filterAction !== null || filterEntity !== null || filterDays !== null;

  return (
    <>
      <CmsTopbar
        title="Lịch sử thay đổi"
        subtitle={`${total} sự kiện — ghi nhận mọi thao tác sửa, xóa, xuất bản trên CMS`}
        action={
          <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
            <ShieldCheck className="w-3.5 h-3.5" /> Đang ghi nhận
          </span>
        }
      />
      <PageContainer>
        {/* Filters */}
        <Card className="p-4 mb-4">
          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={filterActor ?? ""}
              onChange={(e) => setFilterActor(e.target.value ? Number(e.target.value) : null)}
              className="h-8 px-2 rounded-md border border-input bg-background text-xs"
            >
              <option value="">Mọi người dùng</option>
              {facets.actors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name ?? a.email}
                </option>
              ))}
            </select>

            <select
              value={filterAction ?? ""}
              onChange={(e) => setFilterAction((e.target.value || null) as AuditAction | null)}
              className="h-8 px-2 rounded-md border border-input bg-background text-xs"
            >
              <option value="">Mọi hành động</option>
              {facets.actions.map((a) => (
                <option key={a} value={a}>
                  {ACTION_LABEL[a as AuditAction] ?? a}
                </option>
              ))}
            </select>

            <select
              value={filterEntity ?? ""}
              onChange={(e) => setFilterEntity(e.target.value || null)}
              className="h-8 px-2 rounded-md border border-input bg-background text-xs font-mono"
            >
              <option value="">Mọi loại nội dung</option>
              {facets.entities.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>

            <select
              value={filterDays ?? ""}
              onChange={(e) => setFilterDays(e.target.value ? Number(e.target.value) : null)}
              className="h-8 px-2 rounded-md border border-input bg-background text-xs"
            >
              <option value="">Mọi thời gian</option>
              <option value="1">1 ngày qua</option>
              <option value="7">7 ngày qua</option>
              <option value="30">30 ngày qua</option>
              <option value="90">90 ngày qua</option>
            </select>

            {hasFilter && (
              <button
                onClick={() => {
                  setFilterActor(null);
                  setFilterAction(null);
                  setFilterEntity(null);
                  setFilterDays(null);
                }}
                className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-border bg-surface text-xs hover:bg-surface-muted"
              >
                <X className="w-3 h-3" /> Bỏ lọc
              </button>
            )}
          </div>
        </Card>

        {/* Table */}
        {rows.length === 0 ? (
          <Card className="p-12 text-center text-sm text-muted-foreground">
            Không có sự kiện nào khớp bộ lọc.
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-4 py-3 font-semibold">Thời gian</th>
                    <th className="text-left px-4 py-3 font-semibold">Người thực hiện</th>
                    <th className="text-left px-4 py-3 font-semibold">Hành động</th>
                    <th className="text-left px-4 py-3 font-semibold">Loại nội dung</th>
                    <th className="text-left px-4 py-3 font-semibold">Mã đối tượng</th>
                    <th className="text-right px-4 py-3 font-semibold">Chi tiết</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-border hover:bg-surface-muted/30 transition">
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs text-muted-foreground">
                        {formatTime(r.at)}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {r.actor_id == null ? (
                          <span className="text-xs text-muted-foreground italic">Hệ thống</span>
                        ) : (
                          <div className="leading-tight">
                            <div className="font-medium">{r.actor_name ?? r.actor_email}</div>
                            {r.actor_name && <div className="text-[10px] text-muted-foreground">{r.actor_email}</div>}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border ${ACTION_COLOR[r.action]}`}>
                          {ACTION_LABEL[r.action]}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs">{r.entity}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground truncate max-w-50">{r.entity_id ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => setViewing(r)}
                          className="inline-flex items-center gap-0.5 text-primary font-medium hover:underline text-xs"
                        >
                          Xem <ChevronRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-3 mt-4 text-sm">
            <div className="text-muted-foreground">
              {offset + 1} – {Math.min(offset + PAGE_SIZE, total)} / {total}
            </div>
            <div className="flex gap-2">
              <button
                disabled={offset === 0}
                onClick={() => reload(Math.max(0, offset - PAGE_SIZE))}
                className="h-8 px-3 rounded-md border border-border bg-surface text-xs font-medium hover:bg-surface-muted disabled:opacity-40"
              >
                ← Trước
              </button>
              <button
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => reload(offset + PAGE_SIZE)}
                className="h-8 px-3 rounded-md border border-border bg-surface text-xs font-medium hover:bg-surface-muted disabled:opacity-40"
              >
                Sau →
              </button>
            </div>
          </div>
        )}

        {/* Detail modal */}
        {viewing && (
          <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" onClick={() => setViewing(null)}>
            <div className="rounded-xl border border-border bg-background shadow-elevated max-w-4xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border ${ACTION_COLOR[viewing.action]}`}>
                    {ACTION_LABEL[viewing.action]}
                  </span>
                  <span className="font-mono text-sm">{viewing.entity}</span>
                  {viewing.entity_id && <span className="font-mono text-sm text-muted-foreground">#{viewing.entity_id}</span>}
                </div>
                <button onClick={() => setViewing(null)} className="grid place-items-center w-8 h-8 rounded-md hover:bg-muted">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="px-5 py-3 text-xs text-muted-foreground border-b border-border">
                {viewing.actor_id == null ? "Hệ thống" : viewing.actor_name ?? viewing.actor_email} · {formatTime(viewing.at)}
              </div>
              <div className="flex-1 overflow-y-auto p-5 grid md:grid-cols-2 gap-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Trước thay đổi</div>
                  <pre className="text-[11px] font-mono p-3 rounded-md bg-surface-muted border border-border overflow-x-auto max-h-96 overflow-y-auto">
                    {viewing.before_json ? prettyJson(viewing.before_json) : "(không có)"}
                  </pre>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Sau thay đổi</div>
                  <pre className="text-[11px] font-mono p-3 rounded-md bg-surface-muted border border-border overflow-x-auto max-h-96 overflow-y-auto">
                    {viewing.after_json ? prettyJson(viewing.after_json) : "(không có)"}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}
      </PageContainer>
    </>
  );
}

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
