import { useServerFn } from "@tanstack/react-start";
import { Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Card, CardHeader } from "@/components/cms/ui";
import {
  upsertCareersJobFn,
  type CareerLocale,
  type CareerStatus,
  type CareersJobRow,
} from "@/features/careers/careers.actions";

interface Props {
  slug: string;
  locale: CareerLocale;
  job: CareersJobRow | null;
  onSaved: () => void | Promise<void>;
}

interface FormState {
  title: string;
  body_md: string;
  location: string;
  employment_type: string;
  status: CareerStatus;
  category: string;
  hot: boolean;
  badge: string;
  tagline: string;
  salary: string;
  salary_unit: string;
  salary_note: string;
  deadline: string;
  experience: string;
  lead: string;
  responsibilities_json: string;
  requirements_json: string;
  benefits_json: string;
  bonuses_json: string;
  position: number;
}

function safeJson(s: string | null): string {
  return s ?? "";
}

function fromJob(j: CareersJobRow | null): FormState {
  return {
    title: j?.title ?? "",
    body_md: j?.body_md ?? "",
    location: j?.location ?? "",
    employment_type: j?.employment_type ?? "",
    status: j?.status ?? "open",
    category: j?.category ?? "",
    hot: !!j?.hot,
    badge: j?.badge ?? "",
    tagline: j?.tagline ?? "",
    salary: j?.salary ?? "",
    salary_unit: j?.salary_unit ?? "",
    salary_note: j?.salary_note ?? "",
    deadline: j?.deadline ?? "",
    experience: j?.experience ?? "",
    lead: j?.lead ?? "",
    responsibilities_json: safeJson(j?.responsibilities_json ?? null),
    requirements_json: safeJson(j?.requirements_json ?? null),
    benefits_json: safeJson(j?.benefits_json ?? null),
    bonuses_json: safeJson(j?.bonuses_json ?? null),
    position: j?.position ?? 99,
  };
}

function tryParse<T>(raw: string, schema: "object" | "array"): { ok: true; value: T | null } | { ok: false; error: string } {
  if (!raw.trim()) return { ok: true, value: null };
  try {
    const v = JSON.parse(raw);
    if (schema === "object" && (typeof v !== "object" || Array.isArray(v) || v === null)) {
      return { ok: false, error: 'Phải có dạng nhóm theo đề mục: {"đề mục": ["mục 1"]}' };
    }
    if (schema === "array" && !Array.isArray(v)) {
      return { ok: false, error: 'Phải có dạng danh sách: ["mục 1", "mục 2"]' };
    }
    return { ok: true, value: v as T };
  } catch (e) {
    return { ok: false, error: "Định dạng dữ liệu không hợp lệ — kiểm tra lại dấu ngoặc và dấu phẩy" };
  }
}

export function CareersJobEditor({ slug, locale, job, onSaved }: Props) {
  const upsert = useServerFn(upsertCareersJobFn);
  const [form, setForm] = useState<FormState>(() => fromJob(job));
  const [pending, setPending] = useState(false);

  function set<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function save() {
    if (!form.title.trim()) {
      toast.error("Tiêu đề không được rỗng");
      return;
    }
    // Validate JSON fields
    const resp = tryParse<Record<string, string[]>>(form.responsibilities_json, "object");
    if (!resp.ok) { toast.error(`responsibilities: ${resp.error}`); return; }
    const req = tryParse<string[]>(form.requirements_json, "array");
    if (!req.ok) { toast.error(`requirements: ${req.error}`); return; }
    const ben = tryParse<Array<{ i: string; t: string; d: string }>>(form.benefits_json, "array");
    if (!ben.ok) { toast.error(`benefits: ${ben.error}`); return; }
    const bon = tryParse<string[]>(form.bonuses_json, "array");
    if (!bon.ok) { toast.error(`bonuses: ${bon.error}`); return; }

    setPending(true);
    try {
      await upsert({
        data: {
          slug,
          locale,
          title: form.title.trim(),
          body_md: form.body_md,
          location: form.location.trim() || null,
          employment_type: form.employment_type.trim() || null,
          status: form.status,
          category: form.category.trim() || null,
          hot: form.hot,
          badge: form.badge.trim() || null,
          tagline: form.tagline.trim() || null,
          salary: form.salary.trim() || null,
          salary_unit: form.salary_unit.trim() || null,
          salary_note: form.salary_note.trim() || null,
          deadline: form.deadline.trim() || null,
          experience: form.experience.trim() || null,
          lead: form.lead.trim() || null,
          responsibilities: resp.value ?? null,
          requirements: req.value ?? null,
          benefits: ben.value ?? null,
          bonuses: bon.value ?? null,
          position: form.position,
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
      <div className="grid xl:grid-cols-2 gap-6 p-5">
        <div className="space-y-3.5">
          <CardHeader title="Thông tin chính" hint="Hiển thị trên card + trang chi tiết" />
          <Field label="Tiêu đề" required>
            <input type="text" value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={500} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </Field>
          <Field label="Tagline">
            <input type="text" value={form.tagline} onChange={(e) => set("tagline", e.target.value)} maxLength={500} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </Field>
          <Field label="Lead (mô tả ngắn — vài câu intro)">
            <textarea rows={3} value={form.lead} onChange={(e) => set("lead", e.target.value)} maxLength={2000} className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y" />
          </Field>
          <Field label="Nội dung markdown (chi tiết)">
            <textarea rows={6} value={form.body_md} onChange={(e) => set("body_md", e.target.value)} maxLength={20000} className="w-full px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-y font-mono text-xs" />
          </Field>

          <CardHeader title="Phân loại + thông tin nhanh" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category"><input type="text" value={form.category} onChange={(e) => set("category", e.target.value)} maxLength={100} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="ai" /></Field>
            <Field label="Badge"><input type="text" value={form.badge} onChange={(e) => set("badge", e.target.value)} maxLength={100} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="AI/ML Team" /></Field>
            <Field label="Location"><input type="text" value={form.location} onChange={(e) => set("location", e.target.value)} maxLength={200} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="HCM" /></Field>
            <Field label="Loại hợp đồng"><input type="text" value={form.employment_type} onChange={(e) => set("employment_type", e.target.value)} maxLength={100} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Full-time" /></Field>
            <Field label="Salary"><input type="text" value={form.salary} onChange={(e) => set("salary", e.target.value)} maxLength={100} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="20-35" /></Field>
            <Field label="Salary unit"><input type="text" value={form.salary_unit} onChange={(e) => set("salary_unit", e.target.value)} maxLength={50} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="triệu/tháng" /></Field>
            <Field label="Salary note"><input type="text" value={form.salary_note} onChange={(e) => set("salary_note", e.target.value)} maxLength={500} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Thoả thuận theo năng lực" /></Field>
            <Field label="Deadline"><input type="text" value={form.deadline} onChange={(e) => set("deadline", e.target.value)} maxLength={50} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="31/12/2025" /></Field>
            <Field label="Experience"><input type="text" value={form.experience} onChange={(e) => set("experience", e.target.value)} maxLength={100} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="2-5 năm" /></Field>
            <Field label="Position">
              <input type="number" min={0} value={form.position} onChange={(e) => set("position", Number(e.target.value))} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </Field>
          </div>
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.hot} onChange={(e) => set("hot", e.target.checked)} className="rounded" />
              <span>HOT — hiện badge nổi bật</span>
            </label>
          </div>
        </div>

        <div className="space-y-3.5">
          <CardHeader title="Nội dung chi tiết" hint="Hiển thị trong popup chi tiết khi ứng viên xem vị trí này. Có thể bỏ trống nếu chưa cần." />
          <Field label='Mô tả công việc — nhóm theo đề mục'>
            <textarea rows={6} value={form.responsibilities_json} onChange={(e) => set("responsibilities_json", e.target.value)} className="w-full px-3 py-2 rounded-md border border-input bg-background text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-y" placeholder='Ví dụ:&#10;{&#10;  "Phát triển": ["Việc 1", "Việc 2"],&#10;  "Báo cáo": ["Việc 3"]&#10;}' />
            <p className="text-[11px] text-muted-foreground mt-1">Định dạng: <span className="font-mono">{`{"Đề mục": ["công việc 1", "công việc 2"]}`}</span></p>
          </Field>
          <Field label='Yêu cầu ứng viên — danh sách gạch đầu dòng'>
            <textarea rows={4} value={form.requirements_json} onChange={(e) => set("requirements_json", e.target.value)} className="w-full px-3 py-2 rounded-md border border-input bg-background text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-y" placeholder='["Tốt nghiệp CNTT", "Có 2 năm kinh nghiệm"]' />
            <p className="text-[11px] text-muted-foreground mt-1">Định dạng: <span className="font-mono">{`["mục 1", "mục 2"]`}</span></p>
          </Field>
          <Field label='Quyền lợi — mỗi quyền lợi gồm icon + tiêu đề + mô tả'>
            <textarea rows={4} value={form.benefits_json} onChange={(e) => set("benefits_json", e.target.value)} className="w-full px-3 py-2 rounded-md border border-input bg-background text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-y" placeholder='[{"i":"💰","t":"Lương","d":"Hấp dẫn"}]' />
            <p className="text-[11px] text-muted-foreground mt-1">Định dạng: <span className="font-mono">{`[{"i":"emoji","t":"tiêu đề","d":"mô tả"}]`}</span></p>
          </Field>
          <Field label='Thưởng & phúc lợi thêm — danh sách gạch đầu dòng'>
            <textarea rows={3} value={form.bonuses_json} onChange={(e) => set("bonuses_json", e.target.value)} className="w-full px-3 py-2 rounded-md border border-input bg-background text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-y" placeholder='["Macbook Pro", "Học bổng"]' />
            <p className="text-[11px] text-muted-foreground mt-1">Định dạng: <span className="font-mono">{`["mục 1", "mục 2"]`}</span></p>
          </Field>

          <CardHeader title="Trạng thái" />
          <div className="flex gap-2">
            {(["open", "closed", "archived"] as const).map((s) => (
              <button key={s} type="button" onClick={() => set("status", s)} className={`h-9 px-3 rounded-lg text-sm font-medium transition ${form.status === s ? "bg-foreground text-background" : "border border-border bg-surface text-foreground hover:bg-surface-muted"}`}>{s === "open" ? "Đang tuyển" : s === "closed" ? "Đã đóng" : "Đã ẩn"}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-border bg-surface-muted/40 px-5 py-3 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Đang chỉnh sửa bản dịch: <span className="font-medium text-foreground">{locale === "vi" ? "Tiếng Việt" : locale === "en" ? "English" : "中文"}</span>.
        </div>
        <button type="button" onClick={save} disabled={pending} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-50">
          <Save className="w-4 h-4" />
          {pending ? "Đang lưu..." : "Lưu"}
        </button>
      </div>
    </Card>
  );
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        {label} {required ? <span className="text-red-600">*</span> : null}
      </label>
      {children}
    </div>
  );
}
