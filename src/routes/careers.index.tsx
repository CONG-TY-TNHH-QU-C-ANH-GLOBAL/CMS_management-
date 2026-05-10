import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, PageContainer, StatusBadge } from "@/components/cms/ui";
import { CAREERS_JOBS } from "@/lib/cms-mock";
import { Plus, MapPin, Users as UsersIcon } from "lucide-react";

export const Route = createFileRoute("/careers/")({
  component: CareersList,
});

function CareersList() {
  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold">Vị trí tuyển dụng</h2>
          <p className="text-xs text-muted-foreground">{CAREERS_JOBS.filter(j => j.status === "open").length} đang mở · {CAREERS_JOBS.length} tổng</p>
        </div>
        <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 shadow-soft">
          <Plus className="w-4 h-4" /> Đăng tin mới
        </button>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {CAREERS_JOBS.map((j) => (
          <Link key={j.id} to={`/careers/${j.id}` as any}>
            <Card className="p-4 hover:shadow-elevated hover:border-primary/30 transition cursor-pointer h-full">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="font-semibold leading-tight">{j.title}</div>
                  <div className="text-[11px] text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="inline-flex items-center gap-0.5"><MapPin className="w-3 h-3" />{j.location}</span>
                    <span>·</span><span>{j.type}</span>
                    <span>·</span><span>{j.dept}</span>
                  </div>
                </div>
                <StatusBadge status={j.status} />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <UsersIcon className="w-3 h-3" /> {j.applicants} ứng viên
                </span>
                <span className="text-muted-foreground">đăng {j.posted} trước</span>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </PageContainer>
  );
}
