import { createFileRoute } from "@tanstack/react-router";
import { Card, PageContainer, StatusBadge } from "@/components/cms/ui";
import { APPLICANTS } from "@/lib/cms-mock";
import { Mail, Phone, FileText } from "lucide-react";

export const Route = createFileRoute("/careers/applicants")({
  component: ApplicantsPage,
});

function ApplicantsPage() {
  return (
    <PageContainer>
      <h2 className="font-semibold mb-1">Ứng viên</h2>
      <p className="text-xs text-muted-foreground mb-4">{APPLICANTS.length} hồ sơ — sắp xếp theo thời gian nộp</p>
      <Card>
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-muted/50">
            <tr>
              <th className="text-left font-medium px-5 py-2.5">Ứng viên</th>
              <th className="text-left font-medium px-3 py-2.5">Vị trí</th>
              <th className="text-left font-medium px-3 py-2.5">Liên hệ</th>
              <th className="text-left font-medium px-3 py-2.5">Trạng thái</th>
              <th className="text-left font-medium px-5 py-2.5">Nộp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {APPLICANTS.map((a) => (
              <tr key={a.id} className="hover:bg-surface-muted transition cursor-pointer">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="grid place-items-center w-8 h-8 rounded-full bg-gradient-brand text-white text-xs font-semibold">{a.name[0]}</div>
                    <div>
                      <div className="font-medium">{a.name}</div>
                      <button className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-0.5"><FileText className="w-3 h-3" /> Xem CV</button>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-xs">{a.job}</td>
                <td className="px-3 py-3 text-xs text-muted-foreground">
                  <div className="inline-flex items-center gap-1"><Mail className="w-3 h-3" />{a.email}</div>
                  <div className="inline-flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3" />{a.phone}</div>
                </td>
                <td className="px-3 py-3"><StatusBadge status={a.status} /></td>
                <td className="px-5 py-3 text-xs text-muted-foreground">{a.applied} trước</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </PageContainer>
  );
}
