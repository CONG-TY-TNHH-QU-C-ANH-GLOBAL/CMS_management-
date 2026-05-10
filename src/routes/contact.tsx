import { createFileRoute } from "@tanstack/react-router";
import { CmsTopbar } from "@/components/cms/Topbar";
import { Card, CardHeader, PageContainer } from "@/components/cms/ui";
import { OFFICES } from "@/lib/cms-mock";
import { MapPin, Phone, Mail, Star, Edit3, Plus } from "lucide-react";

export const Route = createFileRoute("/contact")({
  head: () => ({ meta: [{ title: "Contact & Offices — THG Content OS" }] }),
  component: ContactPage,
});

function ContactPage() {
  return (
    <>
      <CmsTopbar title="Contact & Offices" subtitle="4 địa chỉ + thông tin liên hệ chính" action={
        <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 shadow-soft">
          <Plus className="w-4 h-4" /> Thêm văn phòng
        </button>
      } />
      <PageContainer>
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 grid sm:grid-cols-2 gap-4">
            {OFFICES.map((o) => (
              <Card key={o.id} className="p-5 hover:shadow-elevated transition">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{o.country}</span>
                    <div>
                      <div className="font-semibold leading-tight">{o.name}</div>
                      {o.primary && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold mt-0.5 px-1.5 py-0.5 rounded bg-warning/10 text-warning-foreground border border-warning/30">
                          <Star className="w-2.5 h-2.5 fill-current" /> Trụ sở chính
                        </span>
                      )}
                    </div>
                  </div>
                  <button className="grid place-items-center w-7 h-7 rounded-md border border-border bg-surface text-muted-foreground hover:text-foreground"><Edit3 className="w-3.5 h-3.5" /></button>
                </div>
                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex items-start gap-2"><MapPin className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />{o.address}</div>
                  <div className="flex items-center gap-2 text-muted-foreground"><Phone className="w-3.5 h-3.5" />{o.phone}</div>
                  <div className="flex items-center gap-2 text-muted-foreground"><Mail className="w-3.5 h-3.5" />{o.email}</div>
                </div>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader title="Thông tin liên hệ chính" hint="Hiển thị trong footer & contact section" />
            <div className="p-5 space-y-3 text-sm">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Hotline</div>
                <div className="font-mono font-semibold text-lg mt-1">0335.124.089</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Email</div>
                <div className="font-mono mt-1">info@thgfulfill.com</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Website</div>
                <div className="font-mono mt-1">www.thgfulfill.com</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">CTA Footer</div>
                <div className="text-sm mt-1">15% OFF for first 50 orders. Support team will contact you within 24h.</div>
              </div>
            </div>
          </Card>
        </div>
      </PageContainer>
    </>
  );
}
