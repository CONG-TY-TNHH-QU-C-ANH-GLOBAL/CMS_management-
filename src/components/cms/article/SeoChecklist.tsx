import { evaluateArticleSeo, type ArticleSeoInput } from "./article-seo";

export function SeoChecklist(props: ArticleSeoInput) {
  const { score, checks } = evaluateArticleSeo(props);
  const passed = checks.filter((check) => check.passed).length;
  return (
    <section className="rounded-xl border border-border bg-muted/20 p-4" aria-label="Kiểm tra SEO">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Kiểm tra SEO</h3>
        <strong className={score >= 80 ? "text-green-700" : "text-amber-700"}>{score}/100</strong>
      </div>
      <progress
        value={score}
        max={100}
        aria-label="Điểm SEO nội dung"
        className="mt-2 h-2 w-full accent-primary"
      />
      <p className="mt-2 text-xs text-muted-foreground">
        {passed}/{checks.length} tiêu chí đạt · Cập nhật theo bản đang soạn.
      </p>
      <ul className="mt-3 space-y-3">
        {checks.map((check) => (
          <li key={check.id} className="text-xs">
            <p
              className={check.passed ? "font-medium text-green-700" : "font-medium text-amber-700"}
            >
              {check.passed ? "✓ Đạt" : "△ Cần xem lại"} · {check.label}
            </p>
            <p className="mt-0.5 text-muted-foreground">{check.hint}</p>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        Điểm tham khảo nội bộ, không đảm bảo thứ hạng Google và không chặn xuất bản.
      </p>
    </section>
  );
}
