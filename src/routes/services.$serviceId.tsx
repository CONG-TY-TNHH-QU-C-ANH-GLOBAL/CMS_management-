import { useState } from "react";
import { createFileRoute, useParams, notFound, Link } from "@tanstack/react-router";
import { Card, CardHeader, PageContainer } from "@/components/cms/ui";
import { InlineEdit } from "@/components/cms/InlineEdit";
import { StickySaveBar } from "@/components/cms/StickySaveBar";
import { SERVICE_PAGES, SERVICES } from "@/lib/cms-mock";
import { ChevronLeft, Plus, Trash2, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/services/$serviceId")({
  component: ServiceDetail,
  loader: ({ params }) => {
    if (!SERVICE_PAGES[params.serviceId]) throw notFound();
    return { id: params.serviceId };
  },
});

function ServiceDetail() {
  const { serviceId } = useParams({ from: "/services/$serviceId" });
  const initial = SERVICE_PAGES[serviceId];
  const meta = SERVICES.find((s) => s.id === serviceId)!;
  const [hero, setHero] = useState(initial.hero);
  const [bullets, setBullets] = useState(initial.bullets);
  const [faqs, setFaqs] = useState(initial.faqs);
  const [dirty, setDirty] = useState(0);
  const bump = () => setDirty((d) => d + 1);

  const save = () => {
    setDirty(0);
  };
  const discard = () => {
    setHero(initial.hero);
    setBullets(initial.bullets);
    setFaqs(initial.faqs);
    setDirty(0);
  };

  return (
    <PageContainer>
      <Link to="/services" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3">
        <ChevronLeft className="w-3.5 h-3.5" /> Quay lại Services
      </Link>

      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{meta.icon}</span>
            <h2 className="text-xl font-semibold">{meta.name}</h2>
          </div>
          <div className="text-sm text-muted-foreground mt-0.5">Trang chi tiết hiển thị tại thgfulfill.com{hero.ctaUrl}</div>
        </div>
        <a
          href={`https://thgfulfill.com${hero.ctaUrl}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-surface text-sm font-medium hover:bg-surface-muted"
        >
          <ExternalLink className="w-4 h-4" /> Xem trên trang thật
        </a>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Hero của trang service" hint="Hiển thị đầu trang chi tiết" />
            <div className="p-5 space-y-3">
              <Field label="Eyebrow"><InlineEdit value={hero.eyebrow} onChange={(v) => { setHero({ ...hero, eyebrow: v }); bump(); }} /></Field>
              <Field label="Title"><InlineEdit value={hero.title} onChange={(v) => { setHero({ ...hero, title: v }); bump(); }} className="font-semibold text-lg" /></Field>
              <Field label="Sub-headline"><InlineEdit value={hero.sub} onChange={(v) => { setHero({ ...hero, sub: v }); bump(); }} multiline /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="CTA text"><InlineEdit value={hero.ctaText} onChange={(v) => { setHero({ ...hero, ctaText: v }); bump(); }} /></Field>
                <Field label="CTA URL"><InlineEdit value={hero.ctaUrl} onChange={(v) => { setHero({ ...hero, ctaUrl: v }); bump(); }} /></Field>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="USP / Bullet points" hint={`${bullets.length} điểm nổi bật`} action={
              <button onClick={() => { setBullets([...bullets, "Điểm nổi bật mới"]); bump(); }} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                <Plus className="w-3.5 h-3.5" /> Thêm
              </button>
            } />
            <ul className="p-3 space-y-1">
              {bullets.map((b, i) => (
                <li key={i} className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-surface-muted">
                  <span className="text-primary font-bold">•</span>
                  <div className="flex-1"><InlineEdit value={b} onChange={(v) => { const a = [...bullets]; a[i] = v; setBullets(a); bump(); }} /></div>
                  <button onClick={() => { setBullets(bullets.filter((_, j) => j !== i)); bump(); }} className="opacity-0 hover:opacity-100 group-hover:opacity-100 grid place-items-center w-6 h-6 rounded text-destructive hover:bg-destructive/10">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="FAQ riêng cho service này" hint={`${faqs.length} câu hỏi`} action={
              <button onClick={() => { setFaqs([...faqs, { q: "Câu hỏi mới?", a: "Trả lời…" }]); bump(); }} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                <Plus className="w-3.5 h-3.5" /> Thêm
              </button>
            } />
            <div className="p-4 space-y-3">
              {faqs.map((f, i) => (
                <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                  <InlineEdit value={f.q} onChange={(v) => { const a = [...faqs]; a[i] = { ...a[i], q: v }; setFaqs(a); bump(); }} className="font-medium" />
                  <InlineEdit value={f.a} onChange={(v) => { const a = [...faqs]; a[i] = { ...a[i], a: v }; setFaqs(a); bump(); }} multiline className="text-sm text-muted-foreground" />
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Live preview */}
        <div className="lg:sticky lg:top-32 self-start">
          <Card>
            <CardHeader title="Preview" hint="Cập nhật khi bạn gõ" />
            <div className="p-4">
              <div className="rounded-lg border border-border bg-gradient-soft p-6 min-h-[400px]">
                <div className="text-[10px] uppercase tracking-wider text-primary font-bold">{hero.eyebrow}</div>
                <div className="text-2xl font-bold tracking-tight mt-1">{hero.title}</div>
                <div className="text-sm text-muted-foreground mt-2">{hero.sub}</div>
                <button className="mt-4 h-9 px-4 rounded-lg bg-foreground text-background text-sm font-semibold">{hero.ctaText}</button>
                <div className="mt-6 space-y-1.5">
                  {bullets.map((b, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <div className="w-4 h-4 rounded-full bg-success/20 text-success grid place-items-center text-[10px] font-bold">✓</div>
                      {b}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <StickySaveBar count={dirty} onSave={save} onDiscard={discard} />
    </PageContainer>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      {children}
    </div>
  );
}
