import { Link, useRouterState } from "@tanstack/react-router";

export function SubTabs({ tabs }: { tabs: { to: string; label: string; count?: number }[] }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="border-b border-border bg-background sticky top-16 z-10">
      <div className="px-6 max-w-350 mx-auto w-full flex gap-1 overflow-x-auto">
        {tabs.map((t) => {
          const active = pathname === t.to;
          return (
            <Link
              key={t.to}
              to={t.to}
              className={[
                "inline-flex items-center gap-1.5 px-3 py-2.5 text-sm transition border-b-2 -mb-px whitespace-nowrap",
                active ? "border-primary text-foreground font-semibold" : "border-transparent text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {t.label}
              {t.count !== undefined && (
                <span className={`text-[10px] font-semibold rounded-full px-1.5 py-0.5 ${active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {t.count}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
