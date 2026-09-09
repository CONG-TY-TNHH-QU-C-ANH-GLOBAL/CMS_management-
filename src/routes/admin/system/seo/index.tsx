import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { CmsTopbar } from "@/components/app-shell/Topbar";
import { Card, PageContainer } from "@/components/cms/ui";
import { listSeoPagesFn, saveSeoPageFn } from "@/features/seo/seo.actions";
import type { SeoPageRow } from "@/features/seo/seo.service";

export const Route = createFileRoute("/admin/system/seo/")({
  head: () => ({ meta: [{ title: "SEO — THG Content OS" }] }),
  loader: () => listSeoPagesFn(),
  component: SeoPage,
});

function SeoPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const save = useServerFn(saveSeoPageFn);
  const [drafts, setDrafts] = useState(() => data.pages as SeoPageRow[]);
  const [pending, setPending] = useState<string | null>(null);
  const update = (index: number, patch: Partial<SeoPageRow>) =>
    setDrafts((rows) => rows.map((row, i) => i === index ? { ...row, ...patch } : row));

  async function submit(row: SeoPageRow) {
    const key = `${row.route}:${row.locale}`;
    setPending(key);
    try {
      await save({ data: { route: row.route, locale: row.locale, title: row.title,
        meta_description: row.meta_description, og_image_url: row.og_image_url,
        indexable: row.indexable, status: row.status, translation_status: row.translation_status } });
      toast.success(`Đã lưu SEO ${row.route} (${row.locale})`);
      await router.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể lưu metadata");
    } finally { setPending(null); }
  }

  return <>
    <CmsTopbar title="SEO control plane" subtitle="Metadata theo route × locale; canonical và hreflang do hệ thống tự sinh" />
    <PageContainer><div className="space-y-4">
      {drafts.map((row, index) => {
        const key = `${row.route}:${row.locale}`;
        return <Card key={key}><div className="p-4 grid gap-3 lg:grid-cols-[160px_1fr_1.2fr_auto] items-start">
          <div><div className="font-semibold text-sm">{row.route}</div><div className="text-xs uppercase text-muted-foreground">{row.locale}</div></div>
          <label className="text-xs font-medium">Title
            <input value={row.title} onChange={(e) => update(index, { title: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm" />
            <span className="text-[10px] text-muted-foreground">{row.title.length} ký tự (cảnh báo, không hard-limit)</span>
          </label>
          <label className="text-xs font-medium">Meta description
            <textarea value={row.meta_description ?? ""} onChange={(e) => update(index, { meta_description: e.target.value || null })} className="mt-1 min-h-20 w-full rounded-md border border-border bg-background p-2 text-sm" />
          </label>
          <div className="space-y-2 min-w-32">
            <select value={row.status} onChange={(e) => update(index, { status: e.target.value as SeoPageRow["status"] })} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
              <option value="draft">Draft</option><option value="live">Live</option><option value="archived">Archived</option>
            </select>
            <select aria-label="Translation review status" value={row.translation_status} onChange={(e) => update(index, { translation_status: e.target.value as SeoPageRow["translation_status"] })} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
              <option value="draft">Bản dịch: Draft</option><option value="reviewed">Bản dịch: Reviewed</option><option value="stale">Bản dịch: Stale</option>
            </select>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={row.indexable === 1} onChange={(e) => update(index, { indexable: e.target.checked ? 1 : 0 })} /> Indexable</label>
            <button onClick={() => submit(row)} disabled={pending === key} className="h-9 w-full rounded-md bg-foreground px-3 text-xs font-semibold text-background disabled:opacity-50">Lưu</button>
          </div>
          <label className="text-xs font-medium lg:col-start-2 lg:col-span-2">OG image URL
            <input value={row.og_image_url ?? ""} onChange={(e) => update(index, { og_image_url: e.target.value || null })} placeholder="https://.../1200x630.jpg" className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm" />
          </label>
          <div className="lg:col-start-2 lg:col-span-2 rounded-lg border border-border bg-white p-3">
            <div className="truncate text-base text-blue-700">{row.title || "Untitled page"}</div>
            <div className="text-xs text-emerald-700">https://thgfulfill.com/{row.locale}{row.route === "/" ? "" : row.route}</div>
            <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{row.meta_description || "Chưa có mô tả."}</div>
          </div>
        </div></Card>;
      })}
    </div></PageContainer>
  </>;
}
