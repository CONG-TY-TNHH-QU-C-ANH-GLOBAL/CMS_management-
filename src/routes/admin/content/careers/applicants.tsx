import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Mail, Phone, Trash2, FileText } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/cms/ConfirmDialog";
import { Card, PageContainer } from "@/components/cms/ui";
import {
  deleteApplicantFn,
  listCareersApplicantsFn,
  updateApplicantStatusFn,
  type ApplicantStatus,
  type CareersApplicantRow,
} from "@/features/careers/careers.actions";

export const Route = createFileRoute("/admin/content/careers/applicants")({
  loader: () => listCareersApplicantsFn(),
  component: ApplicantsPage,
});

const STATUS_LIST: { value: ApplicantStatus; label: string; tone: string }[] = [
  { value: "new", label: "Mới", tone: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "reviewing", label: "Đang xem", tone: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  { value: "interview", label: "Phỏng vấn", tone: "bg-purple-100 text-purple-700 border-purple-200" },
  { value: "offer", label: "Offer", tone: "bg-green-100 text-green-700 border-green-200" },
  { value: "rejected", label: "Từ chối", tone: "bg-red-100 text-red-700 border-red-200" },
  { value: "archived", label: "Lưu trữ", tone: "bg-muted text-muted-foreground border-border" },
];

function formatDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

function ApplicantsPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const applicants = data.applicants as CareersApplicantRow[];
  const [filter, setFilter] = useState<ApplicantStatus | "all">("all");
  const [confirmDelete, setConfirmDelete] = useState<CareersApplicantRow | null>(null);
  const updateStatus = useServerFn(updateApplicantStatusFn);
  const del = useServerFn(deleteApplicantFn);

  const filtered = useMemo(() => {
    if (filter === "all") return applicants;
    return applicants.filter((a) => a.status === filter);
  }, [applicants, filter]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: applicants.length };
    for (const s of STATUS_LIST) map[s.value] = applicants.filter((a) => a.status === s.value).length;
    return map;
  }, [applicants]);

  async function changeStatus(id: number, status: ApplicantStatus) {
    try {
      await updateStatus({ data: { id, status } });
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cập nhật thất bại");
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await del({ data: { id: confirmDelete.id } });
      toast.success("Đã xóa applicant");
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xóa thất bại");
    }
  }

  return (
    <PageContainer>
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 p-4 border-b border-border flex-wrap">
          <button
            onClick={() => setFilter("all")}
            className={`h-8 px-3 rounded-lg text-xs font-medium transition ${filter === "all" ? "bg-foreground text-background" : "border border-border bg-surface text-foreground hover:bg-surface-muted"}`}
          >
            Tất cả ({counts.all})
          </button>
          {STATUS_LIST.map((s) => (
            <button
              key={s.value}
              onClick={() => setFilter(s.value)}
              className={`h-8 px-3 rounded-lg text-xs font-medium transition ${filter === s.value ? "bg-foreground text-background" : "border border-border bg-surface text-foreground hover:bg-surface-muted"}`}
            >
              {s.label} ({counts[s.value] ?? 0})
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-muted/50">
              <tr>
                <th className="text-left font-medium px-5 py-2.5">Ứng viên</th>
                <th className="text-left font-medium px-3 py-2.5">Vị trí</th>
                <th className="text-left font-medium px-3 py-2.5">Liên hệ</th>
                <th className="text-left font-medium px-3 py-2.5">Trạng thái</th>
                <th className="text-left font-medium px-3 py-2.5">Ngày nộp</th>
                <th className="px-5 py-2.5 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground text-sm">
                    Chưa có ứng viên nào.
                  </td>
                </tr>
              )}
              {filtered.map((a) => (
                <tr key={a.id} className="hover:bg-surface-muted transition group">
                  <td className="px-5 py-3">
                    <div className="font-medium">{a.name}</div>
                    {a.cover_letter && (
                      <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed max-w-md">
                        {a.cover_letter}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    <span className="font-mono text-muted-foreground">{a.job_slug}</span>
                  </td>
                  <td className="px-3 py-3 text-xs space-y-0.5">
                    <a href={`mailto:${a.email}`} className="inline-flex items-center gap-1 hover:text-primary">
                      <Mail className="w-3 h-3" /> {a.email}
                    </a>
                    {a.phone && (
                      <div className="inline-flex items-center gap-1 text-muted-foreground ml-3">
                        <Phone className="w-3 h-3" /> {a.phone}
                      </div>
                    )}
                    {a.cv_url && (
                      <div>
                        <a href={a.cv_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                          <FileText className="w-3 h-3" /> CV
                        </a>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <select
                      value={a.status}
                      onChange={(e) => changeStatus(a.id, e.target.value as ApplicantStatus)}
                      className="h-8 px-2 rounded-md border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {STATUS_LIST.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">{formatDate(a.created_at)}</td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => setConfirmDelete(a)}
                      className="grid place-items-center w-7 h-7 rounded-md text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition"
                      title="Xóa"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Xóa applicant?"
        description={`Sẽ xóa hồ sơ của ${confirmDelete?.name}. Hành động này không thể hoàn tác.`}
        confirmLabel="Xóa"
        destructive
      />
    </PageContainer>
  );
}
