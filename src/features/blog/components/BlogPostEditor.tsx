import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronUp, Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Card, CardHeader } from "@/components/cms/ui";
import {
  replaceBlogSlidesFn,
  setBlogThumbnailFn,
  upsertBlogPostFn,
  type BlogLocale,
  type BlogPostRow,
  type BlogSlideRow,
  type BlogStatus,
} from "@/features/blog/blog.actions";

interface Props {
  slug: string;
  locale: BlogLocale;
  post: BlogPostRow | null;
  slides: BlogSlideRow[];
  onSaved: () => void | Promise<void>;
}

interface FormState {
  title: string;
  excerpt: string;
  category: string;
  published_date: string;
  status: BlogStatus;
  seo_title: string;
  seo_description: string;
  thumbnail_url: string;
}

function fromPost(p: BlogPostRow | null): FormState {
  return {
    title: p?.title ?? "",
    excerpt: p?.excerpt ?? "",
    category: p?.category ?? "",
    published_date: p?.published_date ?? "",
    status: p?.status ?? "draft",
    seo_title: p?.seo_title ?? "",
    seo_description: p?.seo_description ?? "",
    thumbnail_url: p?.thumbnail_url ?? "",
  };
}

interface SlideInput {
  url: string;
  alt_text: string;
}

export function BlogPostEditor({ slug, locale, post, slides, onSaved }: Props) {
  const upsert = useServerFn(upsertBlogPostFn);
  const setThumbnail = useServerFn(setBlogThumbnailFn);
  const replaceSlides = useServerFn(replaceBlogSlidesFn);

  const [form, setForm] = useState<FormState>(() => fromPost(post));
  const [slideList, setSlideList] = useState<SlideInput[]>(() =>
    slides.map((s) => ({ url: s.src, alt_text: s.alt_text })),
  );
  const [pending, setPending] = useState(false);

  function set<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function addSlide() {
    setSlideList((s) => [...s, { url: "", alt_text: "" }]);
  }
  function updateSlide(idx: number, patch: Partial<SlideInput>) {
    setSlideList((s) => s.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  }
  function removeSlide(idx: number) {
    setSlideList((s) => s.filter((_, i) => i !== idx));
  }
  function moveSlide(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= slideList.length) return;
    const next = [...slideList];
    [next[idx], next[target]] = [next[target], next[idx]];
    setSlideList(next);
  }

  async function save() {
    if (!form.title.trim()) {
      toast.error("Tiêu đề không được rỗng");
      return;
    }
    setPending(true);
    try {
      // 1. Upsert post fields
      await upsert({
        data: {
          slug,
          locale,
          title: form.title.trim(),
          excerpt: form.excerpt.trim() || null,
          category: form.category.trim() || null,
          published_date: form.published_date.trim() || null,
          status: form.status,
          seo_title: form.seo_title.trim() || null,
          seo_description: form.seo_description.trim() || null,
        },
      });
      // 2. Update thumbnail (separate action so URL→media upsert handles itself)
      if (form.thumbnail_url.trim() && form.thumbnail_url !== post?.thumbnail_url) {
        await setThumbnail({
          data: { slug, locale, url: form.thumbnail_url.trim(), alt_text: form.title.trim() },
        });
      }
      // 3. Replace slides
      const cleaned = slideList.filter((s) => s.url.trim()).map((s) => ({ url: s.url.trim(), alt_text: s.alt_text.trim() || form.title.trim() }));
      await replaceSlides({ data: { slug, locale, slides: cleaned } });

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
      <div className="grid xl:grid-cols-[1fr_360px] gap-6 p-5">
        <div className="space-y-3.5 min-w-0">
          <CardHeader title="Thông tin bài viết" hint="Hiển thị trên danh sách blog + đầu trang chi tiết" />
          <Field label="Tiêu đề" required>
            <input
              type="text"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              maxLength={500}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>
          <Field label="Tóm tắt — hiển thị trên danh sách blog">
            <textarea
              rows={3}
              value={form.excerpt}
              onChange={(e) => set("excerpt", e.target.value)}
              maxLength={2000}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Danh mục">
              <input
                type="text"
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                maxLength={100}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Báo cáo"
              />
            </Field>
            <Field label="Ngày đăng">
              <input
                type="date"
                value={form.published_date}
                onChange={(e) => set("published_date", e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </Field>
          </div>
          <Field label="Đường dẫn ảnh đại diện">
            <input
              type="url"
              value={form.thumbnail_url}
              onChange={(e) => set("thumbnail_url", e.target.value)}
              maxLength={2000}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="https://w.ladicdn.com/..."
            />
          </Field>
          {form.thumbnail_url && (
            <div className="rounded-lg border border-border bg-surface-muted overflow-hidden">
              <img src={form.thumbnail_url} alt="" className="w-full max-h-32 object-cover" referrerPolicy="no-referrer" />
            </div>
          )}

          <CardHeader title="SEO (tối ưu Google)" hint="Tùy chọn — nếu để trống sẽ dùng tiêu đề + tóm tắt phía trên" />
          <Field label="Tiêu đề trên Google">
            <input
              type="text"
              value={form.seo_title}
              onChange={(e) => set("seo_title", e.target.value)}
              maxLength={200}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>
          <Field label="Mô tả trên Google">
            <textarea
              rows={2}
              value={form.seo_description}
              onChange={(e) => set("seo_description", e.target.value)}
              maxLength={500}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            />
          </Field>

          <CardHeader title="Trạng thái" />
          <div className="flex gap-2">
            {(["draft", "review", "live", "archived"] as const).map((s) => {
              const label = s === "draft" ? "Bản nháp" : s === "review" ? "Chờ duyệt" : s === "live" ? "Đang hiển thị" : "Đã ẩn";
              return (
              <button
                key={s}
                type="button"
                onClick={() => set("status", s)}
                className={`h-9 px-3 rounded-lg text-sm font-medium transition ${
                  form.status === s
                    ? "bg-foreground text-background"
                    : "border border-border bg-surface text-foreground hover:bg-surface-muted"
                }`}
              >
                {label}
              </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-3 min-w-0">
          <div className="flex items-center justify-between">
            <CardHeader title={`Ảnh nội dung (${slideList.length})`} hint="Bài viết hiển thị dạng carousel — mỗi slide 1 ảnh" />
            <button
              type="button"
              onClick={addSlide}
              className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border bg-surface text-xs hover:bg-surface-muted"
            >
              <Plus className="w-3 h-3" /> Thêm ảnh
            </button>
          </div>
          {slideList.length === 0 ? (
            <div className="text-sm text-muted-foreground italic px-1">
              Chưa có ảnh nào. Bấm "Thêm ảnh" để bắt đầu.
            </div>
          ) : (
            <ul className="space-y-2">
              {slideList.map((s, idx) => (
                <li key={idx} className="flex gap-2 p-2 rounded-md border border-border bg-surface-muted/30">
                  <div className="flex flex-col gap-0.5 mt-1">
                    <button
                      type="button"
                      onClick={() => moveSlide(idx, -1)}
                      disabled={idx === 0}
                      className="grid place-items-center w-6 h-6 rounded text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSlide(idx, +1)}
                      disabled={idx === slideList.length - 1}
                      className="grid place-items-center w-6 h-6 rounded text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <input
                      type="url"
                      placeholder="https://...image.jpg"
                      value={s.url}
                      onChange={(e) => updateSlide(idx, { url: e.target.value })}
                      maxLength={2000}
                      className="w-full h-8 px-2 rounded border border-input bg-background text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <input
                      type="text"
                      placeholder="Mô tả ngắn cho ảnh (giúp Google + người khiếm thị)"
                      value={s.alt_text}
                      onChange={(e) => updateSlide(idx, { alt_text: e.target.value })}
                      maxLength={200}
                      className="w-full h-8 px-2 rounded border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    {s.url && (
                      <img
                        src={s.url}
                        alt=""
                        className="w-full max-h-24 object-cover rounded"
                        referrerPolicy="no-referrer"
                      />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeSlide(idx)}
                    className="grid place-items-center w-7 h-7 rounded-md border border-border bg-surface text-red-600 hover:bg-red-50 self-start"
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
          Đang chỉnh sửa bài viết + slide cho bản dịch: <span className="font-medium text-foreground">{locale === "vi" ? "Tiếng Việt" : locale === "en" ? "English" : "中文"}</span>.
        </div>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {pending ? "Đang lưu..." : "Lưu"}
        </button>
      </div>
    </Card>
  );
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        {label} {required ? <span className="text-red-600">*</span> : null}
      </label>
      {children}
    </div>
  );
}
