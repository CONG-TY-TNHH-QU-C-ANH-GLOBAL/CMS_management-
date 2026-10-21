import { evaluateArticleSeo, type ArticleSeoInput } from "./article-seo";

export function SeoChecklist(props: ArticleSeoInput) {
  const { score, checks, keyword, wordCount } = evaluateArticleSeo(props);
  const passed = checks.filter((check) => check.passed).length;
  const warnings = checks.filter((check) => check.status === "warning").length;
  const failed = checks.filter((check) => check.status === "fail").length;
  return (
    <section className="rounded-xl border border-border bg-muted/20 p-4" aria-label="Kiểm tra SEO">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Kiểm tra SEO</h3>
        <strong
          className={score > 80 ? "text-green-700" : score > 50 ? "text-amber-700" : "text-red-700"}
        >
          {score}/100
        </strong>
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
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg border p-2 text-green-700">
          <dt>Đạt</dt>
          <dd className="text-lg font-semibold">{passed}</dd>
        </div>
        <div className="rounded-lg border p-2 text-amber-700">
          <dt>Cảnh báo</dt>
          <dd className="text-lg font-semibold">{warnings}</dd>
        </div>
        <div className="rounded-lg border p-2 text-red-700">
          <dt>Chưa đạt</dt>
          <dd className="text-lg font-semibold">{failed}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-muted-foreground" aria-live="polite">
        {keyword.value ? (
          <>
            Từ khóa “{keyword.value}”: {keyword.count} lần · Mật độ {keyword.density.toFixed(2)}% ·{" "}
            {wordCount} từ.
            {keyword.firstWord
              ? ` Xuất hiện đầu ở từ thứ ${keyword.firstWord}.`
              : " Chưa xuất hiện trong nội dung."}
          </>
        ) : (
          "Nhập từ khóa chính để kiểm tra vị trí và mật độ."
        )}
      </p>
      <ul className="mt-3 space-y-3">
        {checks.map((check) => (
          <li key={check.id} className="text-xs">
            <p
              className={
                check.status === "pass"
                  ? "font-medium text-green-700"
                  : check.status === "warning"
                    ? "font-medium text-amber-700"
                    : "font-medium text-red-700"
              }
            >
              {check.status === "pass"
                ? "✓ Đạt"
                : check.status === "warning"
                  ? "△ Cảnh báo"
                  : "✕ Chưa đạt"}{" "}
              · {check.label}
            </p>
            <p className="mt-0.5 text-muted-foreground">{check.hint}</p>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        Tham chiếu{" "}
        <a
          href="https://rankmath.com/kb/score-100-in-tests/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          tiêu chí bài viết Rank Math
        </a>
        . Trọng số và điểm tổng do CMS tính; không phải điểm của plugin Rank Math, không đảm bảo thứ
        hạng Google và không chặn xuất bản.
      </p>
    </section>
  );
}
