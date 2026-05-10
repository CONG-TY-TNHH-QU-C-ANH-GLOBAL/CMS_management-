import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, PageContainer, StatusBadge } from "@/components/cms/ui";
import { SERVICES } from "@/lib/cms-mock";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/services/")({
  component: ServicesIndex,
});

function ServicesIndex() {
  return (
    <PageContainer>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {SERVICES.map((s) => (
          <Link
            key={s.id}
            to={`/services/${s.id}` as any}
            className="block group"
          >
            <Card className="p-5 hover:shadow-elevated hover:border-primary/30 transition h-full">
              <div className="flex items-start justify-between">
                <div className="text-3xl">{s.icon}</div>
                <StatusBadge status={s.status} />
              </div>
              <div className="mt-4 font-semibold">{s.name}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.tagline}</div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-muted-foreground">Giá từ</div>
                  <div className="font-semibold mt-0.5">{s.priceFrom}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Tuyến / option</div>
                  <div className="font-semibold mt-0.5">{s.routes}</div>
                </div>
              </div>
              <div className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary group-hover:gap-2 transition-all">
                Mở trang chi tiết <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </PageContainer>
  );
}
