import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ListChecks } from "lucide-react";
import { useState } from "react";

import { Card, PageContainer, StatusBadge } from "@/components/cms/ui";
import { LocaleTabs, type Locale } from "@/components/cms/LocaleTabs";
import { listServicesFn, type ServiceWithI18n } from "@/features/content/content.actions";

export const Route = createFileRoute("/admin/content/services/")({
  loader: () => listServicesFn(),
  component: ServicesIndex,
});

function ServicesIndex() {
  const data = Route.useLoaderData();
  const services = data.services as ServiceWithI18n[];
  const [locale, setLocale] = useState<Locale>("vi");

  return (
    <PageContainer>
      <Card className="overflow-hidden">
        <LocaleTabs value={locale} onChange={setLocale} />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
          {services.map((s) => {
            const i18n = s.i18n[locale];
            const bullets = s.bullets[locale] ?? [];
            return (
              <Link
                key={s.id}
                to="/admin/content/services/$serviceId"
                params={{ serviceId: s.id }}
                className="block group"
              >
                <Card className="p-5 hover:shadow-elevated hover:border-primary/30 transition h-full">
                  <div className="flex items-start justify-between">
                    <div className="text-3xl">{s.icon}</div>
                    <StatusBadge status={s.status} />
                  </div>
                  <div className="mt-4 font-semibold text-base">
                    {i18n?.name ?? s.id}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {i18n?.tagline ?? "—"}
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <ListChecks className="w-3.5 h-3.5" />
                      {bullets.length} bullets
                    </span>
                    <span>•</span>
                    <span>position #{s.position}</span>
                  </div>
                  {bullets.length > 0 && (
                    <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                      {bullets.slice(0, 3).map((b, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-primary mt-0.5">•</span>
                          <span className="line-clamp-1">{b}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary group-hover:gap-2 transition-all">
                    Mở chi tiết <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </Card>
    </PageContainer>
  );
}
