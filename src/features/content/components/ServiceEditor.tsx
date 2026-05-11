import { useServerFn } from "@tanstack/react-start";
import { Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Card, CardHeader } from "@/components/cms/ui";
import {
  replaceServiceBulletsFn,
  upsertServiceI18nFn,
  type Locale,
  type ServiceI18nRow,
} from "@/features/content/content.actions";

interface Props {
  serviceId: string;
  locale: Locale;
  i18n: ServiceI18nRow | null;
  bullets: string[];
  onSaved: () => void | Promise<void>;
}

interface FormState {
  name: string;
  tagline: string;
  body_md: string;
  cta_text: string;
  cta_url: string;
  hero_eyebrow: string;
  hero_title: string;
  hero_sub: string;
}

function fromI18n(i18n: ServiceI18nRow | null): FormState {
  return {
    name: i18n?.name ?? "",
    tagline: i18n?.tagline ?? "",
    body_md: i18n?.body_md ?? "",
    cta_text: i18n?.cta_text ?? "",
    cta_url: i18n?.cta_url ?? "",
    hero_eyebrow: i18n?.hero_eyebrow ?? "",
    hero_title: i18n?.hero_title ?? "",
    hero_sub: i18n?.hero_sub ?? "",
  };
}

export function ServiceEditor({ serviceId, locale, i18n, bullets, onSaved }: Props) {
  const upsertI18n = useServerFn(upsertServiceI18nFn);
  const replaceBullets = useServerFn(replaceServiceBulletsFn);
  const [form, setForm] = useState<FormState>(() => fromI18n(i18n));
  const [bulletList, setBulletList] = useState<string[]>(bullets);
  const [pending, setPending] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function addBullet() {
    setBulletList((b) => [...b, ""]);
  }
  function updateBullet(idx: number, value: string) {
    setBulletList((b) => b.map((x, i) => (i === idx ? value : x)));
  }
  function removeBullet(idx: number) {
    setBulletList((b) => b.filter((_, i) => i !== idx));
  }
  function moveBullet(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= bulletList.length) return;
    const next = [...bulletList];
    [next[idx], next[target]] = [next[target], next[idx]];
    setBulletList(next);
  }

  async function save() {
    if (!form.name.trim()) {
      toast.error("Tên dịch vụ không được rỗng");
      return;
    }
    setPending(true);
    try {
      await upsertI18n({
        data: {
          service_id: serviceId,
          locale,
          name: form.name.trim(),
          tagline: form.tagline.trim() || null,
          body_md: form.body_md.trim() || null,
          cta_text: form.cta_text.trim() || null,
          cta_url: form.cta_url.trim() || null,
          hero_eyebrow: form.hero_eyebrow.trim() || null,
          hero_title: form.hero_title.trim() || null,
          hero_sub: form.hero_sub.trim() || null,
        },
      });
      await replaceBullets({
        data: {
          service_id: serviceId,
          locale,
          bullets: bulletList.map((b) => b.trim()).filter(Boolean),
        },
      });
      toast.success(`Đã lưu bản dịch ${locale === "vi" ? "Tiếng Việt" : locale === "en" ? "English" : "中文"}`);
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lưu thất bại");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="grid lg:grid-cols-2 gap-6 p-5">
        <div className="space-y-3.5">
          <CardHeader title="Thông tin hiển thị" hint="Card homepage + trang chi tiết" />
          <FieldInput label="Tên dịch vụ" value={form.name} onChange={(v) => set("name", v)} required />
          <FieldInput label="Tagline" value={form.tagline} onChange={(v) => set("tagline", v)} />
          <FieldTextarea
            label="Mô tả ngắn (homepage)"
            value={form.body_md}
            onChange={(v) => set("body_md", v)}
            rows={3}
          />
          <div className="grid grid-cols-2 gap-3">
            <FieldInput label="CTA text" value={form.cta_text} onChange={(v) => set("cta_text", v)} />
            <FieldInput label="CTA URL" value={form.cta_url} onChange={(v) => set("cta_url", v)} mono />
          </div>
          <FieldInput label="Hero eyebrow" value={form.hero_eyebrow} onChange={(v) => set("hero_eyebrow", v)} />
          <FieldInput label="Hero title" value={form.hero_title} onChange={(v) => set("hero_title", v)} />
          <FieldTextarea
            label="Hero subtitle"
            value={form.hero_sub}
            onChange={(v) => set("hero_sub", v)}
            rows={2}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <CardHeader title={`Ý chính nổi bật (${bulletList.length})`} hint="Mỗi gạch đầu dòng = 1 điểm mạnh của dịch vụ" />
            <button
              type="button"
              onClick={addBullet}
              className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border bg-surface text-xs hover:bg-surface-muted"
            >
              <Plus className="w-3 h-3" /> Thêm ý mới
            </button>
          </div>
          {bulletList.length === 0 ? (
            <div className="text-sm text-muted-foreground italic px-1">
              Chưa có ý nào. Bấm "Thêm ý mới" để bắt đầu.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {bulletList.map((text, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <div className="flex flex-col gap-0.5 mt-1">
                    <button
                      type="button"
                      onClick={() => moveBullet(idx, -1)}
                      disabled={idx === 0}
                      className="grid place-items-center w-5 h-5 rounded text-[10px] text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => moveBullet(idx, +1)}
                      disabled={idx === bulletList.length - 1}
                      className="grid place-items-center w-5 h-5 rounded text-[10px] text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      ▼
                    </button>
                  </div>
                  <input
                    type="text"
                    value={text}
                    onChange={(e) => updateBullet(idx, e.target.value)}
                    maxLength={500}
                    className="flex-1 h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Vd: Vận chuyển nhanh chỉ 3-5 ngày..."
                  />
                  <button
                    type="button"
                    onClick={() => removeBullet(idx)}
                    className="grid place-items-center w-9 h-9 rounded-md border border-border bg-surface text-red-600 hover:bg-red-50"
                    title="Xóa"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="border-t border-border bg-surface-muted/40 px-5 py-3 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Đang chỉnh sửa nội dung + ý chính cho bản dịch: <span className="font-medium text-foreground">{locale === "vi" ? "Tiếng Việt" : locale === "en" ? "English" : "中文"}</span>.
        </div>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {pending ? "Đang lưu..." : "Lưu nội dung"}
        </button>
      </div>
    </Card>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  required,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        {label} {required ? <span className="text-red-600">*</span> : null}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring ${mono ? "font-mono text-xs" : ""}`}
      />
    </div>
  );
}

function FieldTextarea({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </label>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y leading-relaxed"
      />
    </div>
  );
}
