import { createFileRoute, Link, useParams, useRouter } from "@tanstack/react-router";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { useState } from "react";

import { Card, PageContainer } from "@/components/cms/ui";
import { LocaleTabs, type Locale } from "@/components/cms/LocaleTabs";
import { BlogPostEditor } from "@/features/blog/components/BlogPostEditor";
import {
  getBlogPostDetailFn,
  type BlogLocale,
  type BlogPostRow,
  type BlogSlideRow,
} from "@/features/blog/blog.actions";

export const Route = createFileRoute("/admin/content/blogs/$slug")({
  loader: async ({ params }) => {
    // Pre-fetch all 3 locales in parallel
    const [en, vi, zh] = await Promise.all([
      getBlogPostDetailFn({ data: { slug: params.slug, locale: "en" } }),
      getBlogPostDetailFn({ data: { slug: params.slug, locale: "vi" } }),
      getBlogPostDetailFn({ data: { slug: params.slug, locale: "zh" } }),
    ]);
    return {
      slug: params.slug,
      details: { en, vi, zh } as Record<BlogLocale, { post: BlogPostRow | null; slides: BlogSlideRow[] }>,
    };
  },
  component: BlogDetailPage,
});

function BlogDetailPage() {
  const { slug } = useParams({ from: "/admin/content/blogs/$slug" });
  const data = Route.useLoaderData();
  const router = useRouter();
  const [locale, setLocale] = useState<Locale>("vi");

  const detail = (data.details as Record<BlogLocale, { post: BlogPostRow | null; slides: BlogSlideRow[] }>)[locale as BlogLocale];

  return (
    <PageContainer>
      <Link
        to="/admin/content/blogs"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> Quay lại danh sách
      </Link>

      <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">
            {detail.post?.title ?? `(chưa có bản dịch ${locale === "vi" ? "Tiếng Việt" : locale === "en" ? "English" : "中文"})`}
          </h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
            <span>Đường dẫn:</span>
            <span className="font-mono">{slug}</span>
            <span>•</span>
            <a
              href={`https://thgfulfill.com/blog/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <ExternalLink className="w-3 h-3" /> Xem trên trang thật
            </a>
          </div>
        </div>
      </div>

      <Card className="overflow-hidden mb-4 p-0">
        <LocaleTabs value={locale} onChange={setLocale} />
      </Card>

      <BlogPostEditor
        key={`${slug}:${locale}`}
        slug={slug}
        locale={locale as BlogLocale}
        post={detail.post}
        slides={detail.slides}
        onSaved={() => router.invalidate()}
      />
    </PageContainer>
  );
}
