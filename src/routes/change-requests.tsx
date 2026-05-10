import { createFileRoute } from "@tanstack/react-router";
import { CmsTopbar } from "@/components/cms/Topbar";
import { Card, PageContainer, StatusBadge, RiskBadge } from "@/components/cms/ui";
import { CHANGE_REQUESTS } from "@/lib/cms-mock";
import { GitPullRequest, MessageSquare, Check, X } from "lucide-react";

export const Route = createFileRoute("/change-requests")({
  head: () => ({ meta: [{ title: "Change Requests — THG Content OS" }] }),
  component: ChangeRequestsPage,
});

function ChangeRequestsPage() {
  return (
    <>
      <CmsTopbar title="Change Requests" subtitle={`${CHANGE_REQUESTS.length} yêu cầu thay đổi`} />
      <PageContainer>
        <Card>
          <ul className="divide-y divide-border">
            {CHANGE_REQUESTS.map((c) => (
              <li key={c.id} className="px-5 py-4 hover:bg-surface-muted transition">
                <div className="flex items-start gap-3">
                  <div className="grid place-items-center w-9 h-9 rounded-lg bg-info/10 text-info shrink-0"><GitPullRequest className="w-4 h-4" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-mono text-muted-foreground">#{c.id.toUpperCase()}</span>
                      <span className="font-medium">{c.title}</span>
                      <RiskBadge risk={c.priority} />
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                      <span>→ {c.target}</span>·<span>bởi {c.by}</span>·<span>{c.time} trước</span>
                      <span className="inline-flex items-center gap-1 text-muted-foreground"><MessageSquare className="w-3 h-3" /> 3 bình luận</span>
                    </div>
                  </div>
                  <StatusBadge status={c.status} />
                  <div className="flex items-center gap-1 ml-1">
                    <button className="grid place-items-center w-8 h-8 rounded-md border border-border bg-surface hover:bg-success/10 hover:border-success/30 hover:text-success transition"><Check className="w-3.5 h-3.5" /></button>
                    <button className="grid place-items-center w-8 h-8 rounded-md border border-border bg-surface hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive transition"><X className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </PageContainer>
    </>
  );
}
