import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CmsTopbar } from "@/components/cms/Topbar";
import { Card, CardHeader, PageContainer } from "@/components/cms/ui";
import { InlineEdit } from "@/components/cms/InlineEdit";
import { StickySaveBar } from "@/components/cms/StickySaveBar";
import {
  Eye, History, Sparkles, Layout, GripVertical, ChevronRight,
  Smartphone, Monitor, Plus, Type, ExternalLink,
} from "lucide-react";

export const Route = createFileRoute("/landing")({
  head: () => ({ meta: [{ title: "Landing Page — THG Content OS" }] }),
  component: LandingPage,
});

type Field = { key: string; label: string; value: string; multiline?: boolean };
type Section = {
  id: string;
  title: string;
  desc: string;
  status: "live" | "review" | "draft";
  lastEdit: string;
  fields: Field[];
};

const INITIAL: Section[] = [
  {
    id: "hero", title: "Khu vực Hero", desc: "Tiêu đề, mô tả phụ, CTA, ảnh nền", status: "review", lastEdit: "2 giờ trước",
    fields: [
      { key: "eyebrow", label: "Nhãn nhỏ phía trên", value: "Fulfill từ Việt Nam đi toàn cầu" },
      { key: "title", label: "Tiêu đề chính (H1)", value: "POD & Dropship fulfillment cho seller TikTok Shop, Shopify, Amazon" },
      { key: "sub", label: "Mô tả phụ", value: "Air freight VN/CN → US 5–8 ngày, kho US domestic từ $1.20/đơn, tracking real-time.", multiline: true },
      { key: "cta1", label: "Nút CTA chính", value: "Nhận báo giá miễn phí" },
      { key: "cta2", label: "Nút CTA phụ", value: "Xem dịch vụ" },
      { key: "media", label: "Ảnh nền (URL)", value: "/assets/hero-world-map.jpg" },
    ],
  },
  {
    id: "trust", title: "Thanh số liệu uy tín", desc: "Logo khách hàng, số liệu nổi bật", status: "live", lastEdit: "1 tuần trước",
    fields: [
      { key: "stat1", label: "Số liệu 1", value: "500K+ đơn / tháng" },
      { key: "stat2", label: "Số liệu 2", value: "98.7% giao đúng hẹn" },
      { key: "stat3", label: "Số liệu 3", value: "4 kho US + VN + CN" },
      { key: "stat4", label: "Số liệu 4", value: "1500+ seller tin dùng" },
    ],
  },
  {
    id: "services", title: "Lưới dịch vụ", desc: "3 thẻ dịch vụ chính + biểu tượng", status: "live", lastEdit: "3 ngày trước",
    fields: [
      { key: "title", label: "Tiêu đề khu vực", value: "Hệ sinh thái fulfillment khép kín" },
      { key: "sub", label: "Mô tả", value: "Từ in ấn POD, vận chuyển quốc tế đến kho US — bạn chỉ cần lo bán hàng.", multiline: true },
    ],
  },
  {
    id: "process", title: "Quy trình hoạt động", desc: "4 bước quy trình", status: "live", lastEdit: "2 tuần trước",
    fields: [
      { key: "step1", label: "Bước 1", value: "Đơn hàng đổ về qua API" },
      { key: "step2", label: "Bước 2", value: "Pick-pack tại kho gần nhất" },
      { key: "step3", label: "Bước 3", value: "Ship đi — tracking đồng bộ" },
      { key: "step4", label: "Bước 4", value: "Báo cáo chi phí real-time" },
    ],
  },
  {
    id: "marketplaces", title: "Logo sàn thương mại", desc: "Thanh logo Shopify, TikTok, Amazon…", status: "live", lastEdit: "5 ngày trước",
    fields: [{ key: "title", label: "Tiêu đề", value: "Tích hợp sẵn các nền tảng bạn đang bán" }],
  },
  {
    id: "testimonials", title: "Đánh giá khách hàng", desc: "Carousel 6 đánh giá khách", status: "live", lastEdit: "1 tháng trước",
    fields: [
      { key: "title", label: "Tiêu đề", value: "Hàng nghìn seller đã chọn THG" },
      { key: "sub", label: "Phụ đề", value: "Câu chuyện thật từ POD seller US, EU, UK." },
    ],
  },
  {
    id: "faq", title: "Câu hỏi thường gặp", desc: "5 câu hỏi nổi bật", status: "live", lastEdit: "2 tuần trước",
    fields: [{ key: "title", label: "Tiêu đề", value: "Câu hỏi thường gặp" }],
  },
  {
    id: "cta", title: "CTA cuối trang", desc: "Khu vực đăng ký nhận báo giá", status: "live", lastEdit: "1 tháng trước",
    fields: [
      { key: "title", label: "Tiêu đề", value: "Sẵn sàng scale đơn hàng quốc tế?" },
      { key: "sub", label: "Mô tả", value: "Đội sales tư vấn miễn phí trong 15 phút." },
      { key: "cta", label: "Nút CTA", value: "Đặt lịch tư vấn" },
    ],
  },
];

function StatusPill({ status }: { status: Section["status"] }) {
  const map = {
    live: "bg-success/10 text-success-foreground border-success/30",
    review: "bg-warning/10 text-warning-foreground border-warning/30",
    draft: "bg-muted text-muted-foreground border-border",
  } as const;
  const label = { live: "Đang live", review: "Chờ duyệt", draft: "Bản nháp" }[status];
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${map[status]}`}>
      {label}
    </span>
  );
}

function LandingPage() {
  const [sections, setSections] = useState<Section[]>(INITIAL);
  const [activeId, setActiveId] = useState<string>(INITIAL[0].id);
  const [dirty, setDirty] = useState<Record<string, true>>({});
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [saving, setSaving] = useState(false);

  const active = useMemo(() => sections.find((s) => s.id === activeId)!, [sections, activeId]);
  const dirtyCount = Object.keys(dirty).length;

  const updateField = (sectionId: string, key: string, value: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId ? { ...s, fields: s.fields.map((f) => (f.key === key ? { ...f, value } : f)) } : s,
      ),
    );
    setDirty((d) => ({ ...d, [`${sectionId}.${key}`]: true }));
  };

  const onSave = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setDirty({});
      setSections((prev) => prev.map((s) => (Object.keys(dirty).some((k) => k.startsWith(s.id + ".")) ? { ...s, status: "review", lastEdit: "vừa xong" } : s)));
      toast.success("Đã lưu bản nháp", { description: `${dirtyCount} thay đổi đã chuyển sang trạng thái chờ duyệt.` });
    }, 600);
  };

  const onDiscard = () => {
    setSections(INITIAL);
    setDirty({});
    toast.info("Đã huỷ thay đổi");
  };

  const onPublish = () => {
    if (dirtyCount > 0) {
      toast.warning("Còn thay đổi chưa lưu", { description: "Hãy lưu bản nháp trước khi publish." });
      return;
    }
    toast.success("Đã publish landing page v3.3", { description: "Thay đổi đã go-live trên thgfulfill.com" });
    setSections((prev) => prev.map((s) => ({ ...s, status: "live" as const })));
  };

  const heroTitle = sections.find((s) => s.id === "hero")?.fields.find((f) => f.key === "title")?.value ?? "";
  const heroSub = sections.find((s) => s.id === "hero")?.fields.find((f) => f.key === "sub")?.value ?? "";
  const heroCta = sections.find((s) => s.id === "hero")?.fields.find((f) => f.key === "cta1")?.value ?? "";

  return (
    <>
      <CmsTopbar
        title="Trang chủ"
        subtitle="thgfulfill.com"
        action={
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-surface text-sm font-medium hover:bg-surface-muted transition">
              <History className="w-4 h-4" /> Lịch sử
            </button>
            <a
              href="https://www.thgfulfill.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-surface text-sm font-medium hover:bg-surface-muted transition"
            >
              <ExternalLink className="w-4 h-4" /> Mở site
            </a>
            <button
              onClick={onPublish}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 shadow-soft transition"
            >
              Publish thay đổi
            </button>
          </div>
        }
      />
      <PageContainer>
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] xl:grid-cols-[240px_1fr_360px] gap-5">
          {/* Sections list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1 mb-1">
              <div>
                <div className="text-sm font-semibold">Cấu trúc trang</div>
                <div className="text-[11px] text-muted-foreground">{sections.length} section</div>
              </div>
              <button
                onClick={() => toast.info("Mock: thêm section mới")}
                className="grid place-items-center w-7 h-7 rounded-md border border-border bg-surface hover:bg-surface-muted text-muted-foreground hover:text-foreground transition"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            {sections.map((s, i) => {
              const isActive = s.id === activeId;
              const isDirty = Object.keys(dirty).some((k) => k.startsWith(s.id + "."));
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveId(s.id)}
                  className={[
                    "w-full text-left rounded-lg border px-3 py-2.5 transition flex items-center gap-2.5 group",
                    isActive
                      ? "border-primary/40 bg-primary-soft shadow-soft"
                      : "border-border bg-card hover:border-primary/20 hover:bg-surface-muted",
                  ].join(" ")}
                >
                  <GripVertical className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                  <div className="text-[10px] font-mono text-muted-foreground w-5">{String(i + 1).padStart(2, "0")}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <div className="text-sm font-medium truncate">{s.title}</div>
                      {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-warning shrink-0" />}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <StatusPill status={s.status} />
                      <span className="text-[10px] text-muted-foreground truncate">{s.lastEdit}</span>
                    </div>
                  </div>
                  <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition ${isActive ? "text-primary" : "text-muted-foreground opacity-0 group-hover:opacity-100"}`} />
                </button>
              );
            })}
          </div>

          {/* Editor */}
          <div className="min-w-0">
            <Card>
              <CardHeader
                title={active.title}
                hint={active.desc}
                action={<StatusPill status={active.status} />}
              />
              <div className="p-5 space-y-4">
                {active.fields.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <label className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                      <Type className="w-3 h-3" /> {f.label}
                    </label>
                    <div className="rounded-lg border border-border bg-surface px-3 py-2 hover:border-primary/30 transition">
                      <InlineEdit
                        value={f.value}
                        multiline={f.multiline}
                        onChange={(v) => updateField(active.id, f.key, v)}
                      />
                    </div>
                    {f.key === "title" && (
                      <div className="text-[10px] text-muted-foreground flex justify-between">
                        <span>Gợi ý: H1 nên dưới 70 ký tự cho SEO</span>
                        <span className={f.value.length > 70 ? "text-destructive" : "text-success-foreground"}>
                          {f.value.length} ký tự
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border bg-surface-muted/40 rounded-b-xl">
                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  Thay đổi sẽ tạo bản nháp chờ duyệt — không go-live ngay.
                </div>
                <button
                  onClick={() => toast.success("AI đã đề xuất bản viết lại", { description: "Mở tab gợi ý để xem" })}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-surface text-xs font-medium hover:bg-background transition"
                >
                  <Sparkles className="w-3.5 h-3.5 text-primary" /> Nhờ AI viết lại
                </button>
              </div>
            </Card>

            <StickySaveBar count={dirtyCount} onSave={onSave} onDiscard={onDiscard} saving={saving} />
          </div>

          {/* Preview */}
          <div className="space-y-4 lg:col-span-2 xl:col-span-1 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-4">
            <Card>
              <CardHeader
                title="Live preview"
                hint="Cập nhật theo từng phím gõ"
                action={
                  <div className="flex items-center gap-1 rounded-md border border-border bg-surface p-0.5">
                    <button
                      onClick={() => setDevice("desktop")}
                      className={`grid place-items-center w-7 h-7 rounded ${device === "desktop" ? "bg-foreground text-background" : "text-muted-foreground"}`}
                    >
                      <Monitor className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDevice("mobile")}
                      className={`grid place-items-center w-7 h-7 rounded ${device === "mobile" ? "bg-foreground text-background" : "text-muted-foreground"}`}
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                    </button>
                  </div>
                }
              />
              <div className="p-4">
                <div
                  className={`mx-auto rounded-lg border border-border bg-gradient-soft overflow-hidden relative transition-all ${
                    device === "mobile" ? "w-[240px] aspect-[9/16]" : "w-full aspect-[4/3]"
                  }`}
                >
                  <div className="absolute inset-x-0 top-0 h-7 bg-white/70 backdrop-blur border-b border-border flex items-center px-2.5 gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-destructive/50" />
                    <div className="w-1.5 h-1.5 rounded-full bg-warning/50" />
                    <div className="w-1.5 h-1.5 rounded-full bg-success/50" />
                    <div className="ml-2 text-[9px] text-muted-foreground">thgfulfill.com</div>
                  </div>
                  <div className="absolute inset-x-0 top-7 bottom-0 p-3 overflow-hidden">
                    <div className="text-[11px] font-bold leading-tight text-foreground line-clamp-3">{heroTitle}</div>
                    <div className="text-[9px] text-muted-foreground mt-1 line-clamp-3">{heroSub}</div>
                    <div className="mt-2 inline-block px-2 py-0.5 rounded-md bg-gradient-brand text-white text-[9px] font-semibold">
                      {heroCta}
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-1">
                      <div className="aspect-square rounded bg-white/70 grid place-items-center text-[8px] text-muted-foreground">Fulfill</div>
                      <div className="aspect-square rounded bg-white/70 grid place-items-center text-[8px] text-muted-foreground">Express</div>
                      <div className="aspect-square rounded bg-white/70 grid place-items-center text-[8px] text-muted-foreground">Warehouse</div>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> Mock render</span>
                  <a href="https://www.thgfulfill.com" target="_blank" rel="noreferrer" className="text-primary hover:underline font-medium">
                    Mở full preview ↗
                  </a>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Layout className="w-4 h-4 text-primary" />
                <div className="text-sm font-semibold">SEO & Meta</div>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Title</span><span className="font-medium">62 ký tự ✓</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Description</span><span className="font-medium">148 ký tự ✓</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">OG Image</span><span className="font-medium text-success-foreground">Đã có</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">JSON-LD</span><span className="font-medium text-success-foreground">Hợp lệ</span></div>
              </div>
            </Card>
          </div>
        </div>
      </PageContainer>
    </>
  );
}
