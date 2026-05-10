import { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="text-center py-12 px-6">
      <div className="inline-grid place-items-center w-12 h-12 rounded-xl bg-primary-soft text-primary mb-3">
        <Icon className="w-6 h-6" />
      </div>
      <div className="font-semibold">{title}</div>
      <div className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{description}</div>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
