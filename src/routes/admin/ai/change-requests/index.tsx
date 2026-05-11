import { createFileRoute } from "@tanstack/react-router";
import { Construction, GitPullRequest } from "lucide-react";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { Card, PageContainer } from "@/components/cms/ui";

export const Route = createFileRoute("/admin/ai/change-requests/")({
  head: () => ({ meta: [{ title: "Change Requests — THG Content OS" }] }),
  component: ChangeRequestsPage,
});

function ChangeRequestsPage() {
  return (
    <>
      <CmsTopbar
        title="Yêu cầu thay đổi"
        subtitle="AI/editor đề xuất thay đổi nội dung — chờ duyệt"
      />
      <PageContainer>
        <Card className="p-12 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-warning/10 grid place-items-center mb-3">
            <Construction className="w-5 h-5 text-warning-foreground" />
          </div>
          <div className="flex items-center justify-center gap-2 mb-1">
            <GitPullRequest className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Change request workflow — Phase 2</h3>
          </div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mt-2">
            Cần thêm bảng <code className="font-mono px-1 bg-muted rounded">content_change_requests</code> + diff viewer + approval workflow. Build sau khi core editing UX hoàn tất.
          </p>
        </Card>
      </PageContainer>
    </>
  );
}
