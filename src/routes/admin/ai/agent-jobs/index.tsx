import { createFileRoute } from "@tanstack/react-router";
import { Bot, Construction } from "lucide-react";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { Card, PageContainer } from "@/components/cms/ui";

export const Route = createFileRoute("/admin/ai/agent-jobs/")({
  head: () => ({ meta: [{ title: "Agent Jobs — THG Content OS" }] }),
  component: AgentJobsPage,
});

function AgentJobsPage() {
  return (
    <>
      <CmsTopbar title="Tác vụ AI" subtitle="AI agent jobs queue + status" />
      <PageContainer>
        <Card className="p-12 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-warning/10 grid place-items-center mb-3">
            <Construction className="w-5 h-5 text-warning-foreground" />
          </div>
          <div className="flex items-center justify-center gap-2 mb-1">
            <Bot className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">AI Agent workflow — Phase 2</h3>
          </div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mt-2">
            Module AI agent (queue jobs, draft creation, source ingestion, change requests, review workflow) sẽ build sau khi core CMS + landing improvements hoàn tất. Cần thêm bảng <code className="font-mono px-1 bg-muted rounded">agent_jobs</code> vào schema.
          </p>
        </Card>
      </PageContainer>
    </>
  );
}
