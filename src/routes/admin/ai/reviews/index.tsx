import { createFileRoute } from "@tanstack/react-router";
import { CheckCheck, Construction } from "lucide-react";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { Card, PageContainer } from "@/components/cms/ui";

export const Route = createFileRoute("/admin/ai/reviews/")({
  head: () => ({ meta: [{ title: "Reviews — THG Content OS" }] }),
  component: ReviewsPage,
});

function ReviewsPage() {
  return (
    <>
      <CmsTopbar
        title="Chờ duyệt"
        subtitle="Bản nháp cần manager phê duyệt trước khi publish"
      />
      <PageContainer>
        <Card className="p-12 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-warning/10 grid place-items-center mb-3">
            <Construction className="w-5 h-5 text-warning-foreground" />
          </div>
          <div className="flex items-center justify-center gap-2 mb-1">
            <CheckCheck className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Review queue — Phase 2</h3>
          </div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mt-2">
            Cần thêm bảng <code className="font-mono px-1 bg-muted rounded">editorial_reviews</code> + status workflow (draft → review → approved → published). Build cùng publish workflow.
          </p>
        </Card>
      </PageContainer>
    </>
  );
}
