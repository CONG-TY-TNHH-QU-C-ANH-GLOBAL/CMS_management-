import { STATUS_BADGE, RISK_BADGE } from "@/lib/cms-mock";

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_BADGE[status] ?? { label: status, className: "bg-muted text-muted-foreground border-border" };
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${s.className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {s.label}
    </span>
  );
}

export function RiskBadge({ risk }: { risk: string }) {
  const cls = RISK_BADGE[risk] ?? "bg-muted text-muted-foreground border-border";
  const label = { critical: "Critical", high: "High", medium: "Medium", low: "Low" }[risk] ?? risk;
  return (
    <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full border ${cls}`}>
      {label}
    </span>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-card shadow-soft ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
      <div>
        <div className="text-sm font-semibold">{title}</div>
        {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
      </div>
      {action}
    </div>
  );
}

export function PageContainer({ children }: { children: React.ReactNode }) {
  return <div className="px-6 py-6 max-w-[1400px] mx-auto w-full">{children}</div>;
}
