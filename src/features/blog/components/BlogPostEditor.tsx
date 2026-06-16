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
  body_md: string;
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
    body_md: p?.body_md ?? "",
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
      const clearedThumbnail = !form.thumbnail_url.trim() && !!post?.thumbnail_url;
      await upsert({
        data: {
          slug,
          locale,
          title: form.title.trim(),
          excerpt: form.excerpt.trim() || null,
          body_md: form.body_md.trim() || null,
          category: form.category.trim() || null,
          published_date: form.published_date.trim() || null,
          status: form.status,
          seo_title: form.seo_title.trim() || null,
          seo_description: form.seo_description.trim() || null,
          ...(clearedThumbnail ? { thumbnail_media_id: null } : {}),
        },
      });
      if (form.thumbnail_url.trim() && form.thumbnail_url !== post?.thumbnail_url) {
        await setThumbnail({
          data: { slug, locale, url: form.thumbnail_url.trim(), alt_text: form.title.trim() },
        });
      }
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
      <div className="grid xl:grid-cols-[380px_1fr] gap-0 divide-x divide-border">

        {/* ── LEFT: Metadata ─────────────────────────────────── */}
        <div className="space-y-3.5 p-5 min-w-0">
          <CardHeader title="Thông tin bài viết" hint="Tiêu đề, tóm tắt, danh mục, SEO, trạng thái" />

          <Field label="Tiêu đề" required>
            <input
              type="text"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              maxLength={500}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </Field>

          <Field label="Tóm tắt — dòng mở đầu bài viết">
            <textarea
              rows={3}
              value={form.excerpt}
              onChange={(e) => set("excerpt", e.target.value)}
              maxLength={2000}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              placeholder="1-2 câu tóm tắt nội dung bài, hiển thị in nghiêng ở đầu bài viết..."
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

          <Field label="Ảnh đại diện (thumbnail)">
            <input
              type="url"
              value={form.thumbnail_url}
              onChange={(e) => set("thumbnail_url", e.target.value)}
              maxLength={2000}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="https://..."
            />
          </Field>
          {form.thumbnail_url && (
            <div className="rounded-lg border border-border bg-surface-muted overflow-hidden">
              <img src={form.thumbnail_url} alt="" className="w-full max-h-28 object-cover" referrerPolicy="no-referrer" />
            </div>
          )}

          <CardHeader title="SEO (tối ưu Google)" hint="Tùy chọn — nếu trống sẽ dùng tiêu đề + tóm tắt" />
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
          <div className="flex flex-wrap gap-2">
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

        {/* ── RIGHT: Article content ──────────────────────────── */}
        <div className="p-5 min-w-0 flex flex-col gap-5">

          {/* Images section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <CardHeader
                title={`Ảnh bài viết (${slideList.length})`}
                hint="Ảnh đầu tiên hiển thị lớn trên trang. Chèn ảnh vào giữa bài: ![mô tả](URL ảnh)"
              />
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
                Chưa có ảnh nào. Bấm "Thêm ảnh" để thêm ảnh bài viết.
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
                      <div className="flex gap-2 items-center">
                        {idx === 0 && (
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded shrink-0">
                            Featured
                          </span>
                        )}
                        <input
                          type="url"
                          placeholder="https://...image.jpg"
                          value={s.url}
                          onChange={(e) => updateSlide(idx, { url: e.target.value })}
                          maxLength={2000}
                          className="w-full h-8 px-2 rounded border border-input bg-background text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      <input
                        type="text"
                        placeholder="Mô tả ảnh (giúp SEO + người khiếm thị)"
                        value={s.alt_text}
                        onChange={(e) => updateSlide(idx, { alt_text: e.target.value })}
                        maxLength={200}
                        className="w-full h-8 px-2 rounded border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      {s.url && (
                        <img
                          src={s.url}
                          alt=""
                          className="w-full max-h-32 object-cover rounded"
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

          <div className="border-t border-border" />

          {/* Body content */}
          <div className="space-y-2 flex-1">
            <CardHeader
              title="Nội dung bài viết"
              hint="Viết theo cấu trúc báo: tiêu đề phần, đoạn văn, danh sách. Hỗ trợ Markdown."
            />
            <textarea
              rows={22}
              value={form.body_md}
              onChange={(e) => set("body_md", e.target.value)}
              maxLength={100000}
              className="w-full px-3 py-2.5 rounded-md border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-y leading-relaxed"
              placeholder={"## Tổng quan thị trường\n\nNội dung đoạn mở đầu, phân tích tình hình chung...\n\n![Biểu đồ tăng trưởng](https://link-den-anh.jpg)\n\n## Xu hướng nổi bật tháng này\n\n- **Điểm 1**: Mô tả chi tiết\n- **Điểm 2**: Mô tả chi tiết\n- **Điểm 3**: Mô tả chi tiết\n\n## Nhận định & Khuyến nghị\n\nKết luận và hành động gợi ý cho doanh nghiệp..."}
            />
            <p className="text-[11px] text-muted-foreground">
              Cú pháp: <code className="bg-muted px-1 rounded">## Tiêu đề</code> — <code className="bg-muted px-1 rounded">**đậm**</code> — <code className="bg-muted px-1 rounded">*nghiêng*</code> — <code className="bg-muted px-1 rounded">- danh sách</code> — <code className="bg-muted px-1 rounded">![mô tả](URL ảnh)</code>
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-border bg-surface-muted/40 px-5 py-3 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Đang chỉnh sửa bản dịch: <span className="font-medium text-foreground">{locale === "vi" ? "Tiếng Việt" : locale === "en" ? "English" : "中文"}</span>
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
