import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { Card, CardHeader, PageContainer } from "@/components/cms/ui";
import { InlineEdit } from "@/components/cms/InlineEdit";
import { StickySaveBar } from "@/components/cms/StickySaveBar";
import { LocaleTabs, type Locale } from "@/components/cms/LocaleTabs";
import {
  Eye, Sparkles, Layout, GripVertical, ChevronRight,
  Smartphone, Monitor, Plus, Type, ExternalLink, CheckCircle2,
} from "lucide-react";
import {
  listHomepageBlocksFn,
  upsertHomepageBlockFn,
  type HomepageBlock,
  type HomepageBlockKind,
} from "@/features/homepage/homepage.actions";

export const Route = createFileRoute("/admin/content/landing/")({
  head: () => ({ meta: [{ title: "Trang chủ — THG Content OS" }] }),
  loader: () => listHomepageBlocksFn({ data: { locale: "vi" } }),
  component: LandingPage,
});

type Field = { key: string; label: string; multiline?: boolean };
interface SectionMeta {
  kind: HomepageBlockKind;
  title: string;
  desc: string;
  fields: Field[];
}

// Section metadata — labels + field schema. Values come from CMS homepage_blocks.
const SECTIONS: SectionMeta[] = [
  {
    kind: "hero",
    title: "Phần đầu trang",
    desc: "Khung lớn ngay khi mở web — tiêu đề, mô tả, nút bấm và ảnh nền",
    fields: [
      { key: "eyebrow", label: "Dòng chữ nhỏ phía trên tiêu đề" },
      { key: "title", label: "Tiêu đề chính (chữ to nhất)" },
      { key: "sub", label: "Mô tả ngắn dưới tiêu đề", multiline: true },
      { key: "cta1", label: "Nút bấm chính (màu nổi)" },
      { key: "cta2", label: "Nút bấm phụ (chỉ viền)" },
      { key: "media", label: "Đường dẫn ảnh nền" },
    ],
  },
  {
    kind: "trust",
    title: "Số liệu nổi bật",
    desc: "4 con số ngắn gọn giúp khách tin tưởng ngay khi mới vào trang",
    fields: [
      { key: "stat1", label: "Con số 1" },
      { key: "stat2", label: "Con số 2" },
      { key: "stat3", label: "Con số 3" },
      { key: "stat4", label: "Con số 4" },
    ],
  },
  {
    kind: "services_grid",
    title: "Danh sách dịch vụ",
    desc: "Các thẻ dịch vụ hiển thị trên trang chủ. Nội dung chi tiết của từng dịch vụ sửa ở mục “Dịch vụ”.",
    fields: [
      { key: "title", label: "Tiêu đề khu vực" },
      { key: "sub", label: "Mô tả ngắn", multiline: true },
    ],
  },
  {
    kind: "about_video",
    title: "Video giới thiệu công ty",
    desc: "Khu vực có video YouTube giới thiệu THG kèm 4 điểm nổi bật bên cạnh",
    fields: [
      { key: "video_url", label: "Đường dẫn video YouTube (dạng watch?v=… hoặc youtu.be/…)" },
      { key: "title", label: "Tiêu đề khu vực" },
      { key: "sub", label: "Mô tả ngắn", multiline: true },
      { key: "highlight1", label: "Điểm nổi bật 1" },
      { key: "highlight2", label: "Điểm nổi bật 2" },
      { key: "highlight3", label: "Điểm nổi bật 3" },
      { key: "highlight4", label: "Điểm nổi bật 4" },
    ],
  },
  {
    kind: "process",
    title: "Quy trình 4 bước",
    desc: "4 bước seller làm việc với THG sau khi đăng ký",
    fields: [
      { key: "step1", label: "Bước 1" },
      { key: "step2", label: "Bước 2" },
      { key: "step3", label: "Bước 3" },
      { key: "step4", label: "Bước 4" },
    ],
  },
  {
    kind: "integrations",
    title: "Logo sàn thương mại điện tử",
    desc: "Logo các sàn đối tác THG hỗ trợ kết nối. Danh sách logo sửa ở mục “Sàn TMĐT”.",
    fields: [{ key: "title", label: "Tiêu đề khu vực" }],
  },
  {
    kind: "testimonials",
    title: "Đánh giá của khách hàng",
    desc: "Khu vực hiển thị lời khen. Nội dung từng đánh giá sửa ở mục “Đánh giá khách hàng”.",
    fields: [
      { key: "title", label: "Tiêu đề khu vực" },
      { key: "sub", label: "Mô tả ngắn" },
    ],
  },
  {
    kind: "faq",
    title: "Câu hỏi thường gặp",
    desc: "Khu vực FAQ. Danh sách câu hỏi sửa ở mục “Câu hỏi thường gặp”.",
    fields: [{ key: "title", label: "Tiêu đề khu vực" }],
  },
  {
    kind: "contact",
    title: "Banner mời đăng ký (cuối trang)",
    desc: "Banner cuối trang mời khách để lại thông tin nhận tư vấn",
    fields: [
      { key: "title", label: "Tiêu đề mời đăng ký" },
      { key: "sub", label: "Mô tả ngắn" },
      { key: "cta", label: "Nút bấm chính" },
    ],
  },
];

function getFieldValue(block: HomepageBlock | undefined, key: string): string {
  if (!block) return "";
  const v = block.payload[key];
  return typeof v === "string" ? v : v != null ? String(v) : "";
}

function buildSectionPayload(meta: SectionMeta, formValues: Record<string, string>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const f of meta.fields) {
    payload[f.key] = formValues[f.key] ?? "";
  }
  return payload;
}

function LandingPage() {
  const initial = Route.useLoaderData();
  const router = useRouter();
  const upsert = useServerFn(upsertHomepageBlockFn);

  const [locale, setLocale] = useState<Locale>("vi");
  const [blocks, setBlocks] = useState<HomepageBlock[]>(initial.blocks);
  const [activeKind, setActiveKind] = useState<HomepageBlockKind>(SECTIONS[0].kind);
  // Dirty form state per (kind, fieldKey)
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [saving, setSaving] = useState(false);

  const active = useMemo(() => SECTIONS.find((s) => s.kind === activeKind)!, [activeKind]);
  const activeBlock = blocks.find((b) => b.kind === activeKind);

  const dirtyKinds = useMemo(() => {
    const set = new Set<HomepageBlockKind>();
    for (const kind of Object.keys(drafts) as HomepageBlockKind[]) {
      const block = blocks.find((b) => b.kind === kind);
      const draft = drafts[kind] ?? {};
      const meta = SECTIONS.find((s) => s.kind === kind);
      if (!meta) continue;
      for (const f of meta.fields) {
        if ((draft[f.key] ?? "") !== getFieldValue(block, f.key)) {
          set.add(kind);
          break;
        }
      }
    }
    return set;
  }, [drafts, blocks]);
  const dirtyCount = dirtyKinds.size;

  async function loadLocale(next: Locale) {
    setLocale(next);
    const data = await listHomepageBlocksFn({ data: { locale: next } });
    setBlocks(data.blocks);
    setDrafts({});
  }

  function getCurrentValue(kind: HomepageBlockKind, fieldKey: string): string {
    const draft = drafts[kind]?.[fieldKey];
    if (draft !== undefined) return draft;
    return getFieldValue(blocks.find((b) => b.kind === kind), fieldKey);
  }

  function updateField(kind: HomepageBlockKind, fieldKey: string, value: string) {
    setDrafts((d) => ({ ...d, [kind]: { ...(d[kind] ?? {}), [fieldKey]: value } }));
  }

  async function onSave() {
    if (dirtyKinds.size === 0) return;
    setSaving(true);
    try {
      for (const kind of dirtyKinds) {
        const meta = SECTIONS.find((s) => s.kind === kind);
        if (!meta) continue;
        const values: Record<string, string> = {};
        for (const f of meta.fields) {
          values[f.key] = getCurrentValue(kind, f.key);
        }
        const payload = buildSectionPayload(meta, values);
        await upsert({ data: { kind, locale, payload } });
      }
      // Reload from server to sync IDs and positions
      const data = await listHomepageBlocksFn({ data: { locale } });
      setBlocks(data.blocks);
      setDrafts({});
      await router.invalidate();
      toast.success("Đã lưu thay đổi", { description: "Nội dung mới đã cập nhật trên trang chủ." });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  function onDiscard() {
    setDrafts({});
    toast.info("Đã huỷ thay đổi");
  }

  const heroBlock = blocks.find((b) => b.kind === "hero");
  const heroTitle = drafts.hero?.title ?? getFieldValue(heroBlock, "title");
  const heroSub = drafts.hero?.sub ?? getFieldValue(heroBlock, "sub");
  const heroCta = drafts.hero?.cta1 ?? getFieldValue(heroBlock, "cta1");

  return (
    <>
      <CmsTopbar
        title="Trang chủ"
        subtitle="thgfulfill.com"
        action={
          <div className="flex items-center gap-2">
            {dirtyCount === 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Đã đồng bộ với website
              </span>
            )}
            <a
              href="https://www.thgfulfill.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-surface text-sm font-medium hover:bg-surface-muted transition"
            >
              <ExternalLink className="w-4 h-4" /> Mở site
            </a>
          </div>
        }
      />
      <PageContainer>
        {/* Locale tabs */}
        <Card className="overflow-hidden mb-4 p-0">
          <LocaleTabs value={locale} onChange={loadLocale} />
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] xl:grid-cols-[240px_1fr_360px] gap-5">
          {/* Sections list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1 mb-1">
              <div>
                <div className="text-sm font-semibold">Cấu trúc trang</div>
                <div className="text-[11px] text-muted-foreground">{SECTIONS.length} khu vực</div>
              </div>
              <button
                onClick={() => toast.info("Tính năng thêm khu vực mới sẽ có ở phiên bản sau")}
                className="grid place-items-center w-7 h-7 rounded-md border border-border bg-surface hover:bg-surface-muted text-muted-foreground hover:text-foreground transition"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            {SECTIONS.map((s, i) => {
              const isActive = s.kind === activeKind;
              const isDirty = dirtyKinds.has(s.kind);
              return (
                <button
                  key={s.kind}
                  onClick={() => setActiveKind(s.kind)}
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
                      {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />}
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
              <CardHeader title={active.title} hint={active.desc} />
              <div className="p-5 space-y-4">
                {active.fields.map((f) => {
                  const value = getCurrentValue(active.kind, f.key);
                  return (
                    <div key={f.key} className="space-y-1">
                      <label className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                        <Type className="w-3 h-3" /> {f.label}
                      </label>
                      <div className="rounded-lg border border-border bg-surface px-3 py-2 hover:border-primary/30 transition">
                        <InlineEdit
                          value={value}
                          multiline={f.multiline}
                          onChange={(v) => updateField(active.kind, f.key, v)}
                        />
                      </div>
                      {f.key === "title" && (
                        <div className="text-[10px] text-muted-foreground flex justify-between">
                          <span>Gợi ý: tiêu đề nên dưới 70 ký tự để Google hiển thị đầy đủ</span>
                          <span className={value.length > 70 ? "text-rose-600" : "text-emerald-700"}>
                            {value.length} ký tự
                          </span>
                        </div>
                      )}
                      {f.key === "video_url" && (
                        <div className="text-[10px] text-muted-foreground">
                          Dán link xem video trên YouTube — hệ thống tự lấy mã video để nhúng. Ví dụ: <code className="font-mono px-1 bg-muted rounded">https://www.youtube.com/watch?v=Cvj8kqFMLfk</code>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border bg-surface-muted/40 rounded-b-xl">
                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  Thay đổi sẽ lưu thẳng vào trang chủ — bấm "Lưu thay đổi" để cập nhật.
                </div>
              </div>
            </Card>

            <StickySaveBar count={dirtyCount} onSave={onSave} onDiscard={onDiscard} saving={saving} />
          </div>

          {/* Preview */}
          <div className="space-y-4 lg:col-span-2 xl:col-span-1 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-4">
            <Card>
              <CardHeader
                title="Xem trước"
                hint="Cập nhật ngay khi bạn gõ"
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
                    device === "mobile" ? "w-60 aspect-9/16" : "w-full aspect-4/3"
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
                  <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> Bản phác thảo</span>
                  <a href="https://www.thgfulfill.com" target="_blank" rel="noreferrer" className="text-primary hover:underline font-medium">
                    Mở website thật ↗
                  </a>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Layout className="w-4 h-4 text-primary" />
                <div className="text-sm font-semibold">Tối ưu Google</div>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Tiêu đề trên Google</span><span className="font-medium">{heroTitle.length} ký tự</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Mô tả trên Google</span><span className="font-medium">{heroSub.length} ký tự</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Ảnh preview khi share</span><span className="font-medium text-emerald-700">Đã có</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Dữ liệu cấu trúc</span><span className="font-medium text-emerald-700">Hợp lệ</span></div>
              </div>
            </Card>
          </div>
        </div>
      </PageContainer>
    </>
  );
}
