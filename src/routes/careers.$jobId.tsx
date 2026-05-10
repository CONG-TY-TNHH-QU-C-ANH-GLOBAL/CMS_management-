import { createFileRoute, Link, useParams, notFound } from "@tanstack/react-router";
import { Card, CardHeader, PageContainer, StatusBadge } from "@/components/cms/ui";
import { CAREERS_JOBS, JOB_DETAIL } from "@/lib/cms-mock";
import { ChevronLeft, MapPin, Calendar, Briefcase, ExternalLink, Edit3 } from "lucide-react";

export const Route = createFileRoute("/careers/$jobId")({
  component: JobDetailPage,
  loader: ({ params }) => {
    if (!CAREERS_JOBS.find(j => j.id === params.jobId)) throw notFound();
    return { id: params.jobId };
  },
});

function JobDetailPage() {
  const { jobId } = useParams({ from: "/careers/$jobId" });
  const job = CAREERS_JOBS.find(j => j.id === jobId)!;
  const detail = JOB_DETAIL[jobId] ?? JOB_DETAIL.j1;

  return (
    <PageContainer>
      <Link to="/careers" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3">
        <ChevronLeft className="w-3.5 h-3.5" /> Quay lại danh sách
      </Link>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-semibold">{job.title}</h2>
            <StatusBadge status={job.status} />
          </div>
          <div className="text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{job.location}</span>
            <span className="inline-flex items-center gap-1"><Briefcase className="w-3.5 h-3.5" />{job.type} · {job.dept}</span>
            <span className="inline-flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />Hạn nộp: {detail.deadline}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-surface text-sm font-medium hover:bg-surface-muted">
            <Edit3 className="w-4 h-4" /> Chỉnh sửa
          </button>
          <a href={detail.applyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90">
            <ExternalLink className="w-4 h-4" /> Trang ứng tuyển
          </a>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card><CardHeader title="Mô tả công việc" /><div className="p-5 text-sm leading-relaxed">{detail.description}</div></Card>
          <Card>
            <CardHeader title="Yêu cầu" />
            <ul className="p-5 space-y-2 text-sm">
              {detail.requirements.map((r, i) => (
                <li key={i} className="flex items-start gap-2"><span className="text-primary mt-1">•</span>{r}</li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Quyền lợi" />
            <ul className="p-5 space-y-2 text-sm">
              {detail.benefits.map((r, i) => (
                <li key={i} className="flex items-start gap-2"><span className="text-success mt-1">✓</span>{r}</li>
              ))}
            </ul>
          </Card>
        </div>
        <Card className="p-5 self-start">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Thống kê</div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Ứng viên</span><span className="font-semibold">{job.applicants}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Đã phỏng vấn</span><span className="font-semibold">3</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Đã offer</span><span className="font-semibold">1</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Đăng cách đây</span><span className="font-semibold">{job.posted}</span></div>
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}
