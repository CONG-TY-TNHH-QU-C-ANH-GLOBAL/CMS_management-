import { createFileRoute } from "@tanstack/react-router";
import { CmsTopbar } from "@/components/cms/Topbar";
import { Card, PageContainer, RiskBadge } from "@/components/cms/ui";
import { AUDIT } from "@/lib/cms-mock";
import { ShieldCheck, Download } from "lucide-react";

export const Route = createFileRoute("/audit")({
  head: () => ({ meta: [{ title: "Audit Logs — THG Content OS" }] }),
  component: AuditPage,
});

function AuditPage() {
  return (
    <>
      <CmsTopbar title="Nhật ký bảo mật" subtitle="Mọi hành động nhạy cảm đều ghi lại" action={
        <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-surface text-sm font-medium hover:bg-surface-muted">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      } />
      <PageContainer>
        <Card>
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted-foreground bg-surface-muted/50">
              <tr>
                <th className="text-left font-medium px-5 py-2.5">Người dùng</th>
                <th className="text-left font-medium px-3 py-2.5">Hành động</th>
                <th className="text-left font-medium px-3 py-2.5">Đối tượng</th>
                <th className="text-left font-medium px-3 py-2.5">IP</th>
                <th className="text-left font-medium px-3 py-2.5">Mức độ</th>
                <th className="text-left font-medium px-5 py-2.5">Thời gian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {AUDIT.map((a) => (
                <tr key={a.id} className="hover:bg-surface-muted transition">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="grid place-items-center w-7 h-7 rounded-full bg-gradient-brand text-white text-xs font-semibold">{a.actor[0]}</div>
                      <span className="font-medium">{a.actor}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3"><span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-muted">{a.action}</span></td>
                  <td className="px-3 py-3">{a.target}</td>
                  <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{a.ip}</td>
                  <td className="px-3 py-3"><RiskBadge risk={a.risk} /></td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{a.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </PageContainer>
    </>
  );
}
