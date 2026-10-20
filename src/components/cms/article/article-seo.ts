import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";

export interface ArticleSeoInput {
  title: string;
  seoTitle?: string;
  description?: string;
  focusKeyword?: string;
  slug: string;
  markdown: string;
  hasCover?: boolean;
  imageAlts?: string[];
  locale?: string;
  kind?: "blog" | "event";
}
interface MarkdownNode {
  type: string;
  value?: string;
  url?: string;
  alt?: string | null;
  depth?: number;
  children?: MarkdownNode[];
}
const parser = unified().use(remarkParse).use(remarkGfm);
const normalize = (text: string) =>
  text.normalize("NFC").toLowerCase().replace(/\s+/gu, " ").trim();
const slugify = (text: string) =>
  normalize(text)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
const wordChar = (text: string) =>
  /[\p{L}\p{N}_]/u.test(text) &&
  !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);

/** Literal phrases; no stemming, accent folding or user-supplied regular expressions. */
function occurrences(text: string, keyword: string): number[] {
  if (!keyword) return [];
  const positions: number[] = [];
  let offset = 0;
  while (offset <= text.length - keyword.length) {
    const at = text.indexOf(keyword, offset);
    if (at < 0) break;
    const end = at + keyword.length;
    const left = at === 0 || !wordChar(keyword[0]) || !wordChar(text[at - 1]);
    const right = end === text.length || !wordChar(keyword.at(-1)!) || !wordChar(text[end]);
    if (left && right) positions.push(at);
    offset = end;
  }
  return positions;
}
function articleText(markdown: string) {
  const headings: Array<{ level: number; text: string }> = [];
  const imageAlts: string[] = [];
  const links: string[] = [];
  function read(node: MarkdownNode): string {
    if (["code", "inlineCode", "html", "definition"].includes(node.type)) return " ";
    if (node.type === "image" || node.type === "imageReference") {
      imageAlts.push(node.alt ?? "");
      return "";
    }
    if (node.type === "link" && node.url) links.push(node.url);
    if (node.type === "text") return node.value ?? "";
    const content = (node.children ?? []).map(read).join("");
    if (node.type === "heading") headings.push({ level: node.depth!, text: normalize(content) });
    return ["paragraph", "heading", "tableCell", "break", "thematicBreak"].includes(node.type)
      ? `${content}\n`
      : content;
  }
  return { text: normalize(read(parser.parse(markdown))), headings, imageAlts, links };
}
export type SeoStatus = "pass" | "warning" | "fail";

/** Rank Math's documented post tests, with explicit CMS weights, not its own score. */
export function evaluateArticleSeo(input: ArticleSeoInput) {
  const article = articleText(input.markdown);
  const words = [
    ...new Intl.Segmenter(input.locale || "vi", { granularity: "word" }).segment(article.text),
  ].filter((s) => s.isWordLike);
  const wordCount = words.length;
  const keyword = normalize(input.focusKeyword ?? "");
  const positions = occurrences(article.text, keyword);
  const density = wordCount ? (positions.length / wordCount) * 100 : 0;
  const title = input.seoTitle?.trim() || `${input.title.trim()} — TH Group Fulfill`;
  const normalizedTitle = normalize(title);
  const description = input.description?.trim() || "";
  const titlePositions = occurrences(normalizedTitle, keyword);
  const alts = [...article.imageAlts, ...(input.imageAlts ?? [])];
  const levels = article.headings.map((h) => h.level);
  const contains = (text: string) => occurrences(normalize(text), keyword).length > 0;
  const internal = article.links.some((href) => {
    try {
      return (
        !href.startsWith("#") &&
        new URL(href, "https://thgfulfill.com").origin === "https://thgfulfill.com"
      );
    } catch {
      return false;
    }
  });
  const introWords = wordCount < 300 ? wordCount : Math.ceil(wordCount * 0.1);
  const introEnd = introWords
    ? words[introWords - 1].index + words[introWords - 1].segment.length
    : 0;
  const lengthRatio =
    wordCount > 2500
      ? 1
      : wordCount >= 2000
        ? 0.7
        : wordCount >= 1500
          ? 0.6
          : wordCount >= 1000
            ? 0.4
            : wordCount >= 600
              ? 0.2
              : 0;
  const densityRatio =
    keyword && density >= 1 && density <= 1.5
      ? 1
      : keyword && density > 0 && density <= 2.5
        ? 0.5
        : 0;
  const keywordSlug = slugify(keyword);
  const keywordInSlug = !!keywordSlug && `-${slugify(input.slug)}-`.includes(`-${keywordSlug}-`);
  const checks: Array<{
    id: string;
    label: string;
    weight: number;
    passed: boolean;
    hint: string;
    ratio?: number;
  }> = [
    {
      id: "focus",
      label: "Đã chọn từ khóa chính",
      weight: 4,
      passed: !!keyword,
      hint: "Chọn một cụm từ mô tả đúng chủ đề và nhu cầu tìm kiếm.",
    },
    {
      id: "keyword-title",
      label: "Từ khóa trong tiêu đề SEO",
      weight: 10,
      passed: titlePositions.length > 0,
      hint: "Đặt từ khóa trong tiêu đề trên Google (hoặc tiêu đề bài khi để trống).",
    },
    {
      id: "keyword-description",
      label: "Từ khóa trong mô tả SEO",
      weight: 8,
      passed: contains(description.slice(0, 160)),
      hint: "Đưa từ khóa vào 160 ký tự đầu của mô tả SEO hoặc đoạn tóm tắt đang dùng.",
    },
    {
      id: "keyword-url",
      label: "Từ khóa trong URL",
      weight: 8,
      passed: keywordInSlug,
      hint: "Slug nên chứa cụm từ khóa; URL tiếng Việt được đối chiếu cả dạng bỏ dấu.",
    },
    {
      id: "keyword-intro",
      label: "Từ khóa ở đầu bài",
      weight: 8,
      passed: positions.some((at) => at < introEnd),
      hint: `Kiểm tra ${introWords} từ đầu: bài dưới 300 từ dùng toàn bài, bài từ 300 từ dùng 10% đầu.`,
    },
    {
      id: "keyword-content",
      label: "Từ khóa trong nội dung",
      weight: 8,
      passed: positions.length > 0,
      hint: `${positions.length} lần trong văn bản; không tính URL, alt ảnh, mã hoặc HTML.`,
    },
    {
      id: "keyword-heading",
      label: "Từ khóa trong tiêu đề phụ",
      weight: 6,
      passed: article.headings.some((h) => h.level >= 2 && h.level <= 4 && contains(h.text)),
      hint: "Có ít nhất một H2/H3/H4 chứa từ khóa một cách tự nhiên.",
    },
    {
      id: "keyword-alt",
      label: "Từ khóa trong alt ảnh",
      weight: 4,
      passed: alts.some(contains),
      hint: "Mô tả ít nhất một ảnh liên quan bằng từ khóa; không nhồi vào mọi ảnh.",
    },
    {
      id: "density",
      label: "Mật độ từ khóa",
      weight: 6,
      passed: densityRatio === 1,
      ratio: densityRatio,
      hint: `${density.toFixed(2)}% (${positions.length} lần / ${wordCount} từ). Tham chiếu 1–1,5%; trên 2,5% cảnh báo nhồi từ khóa. Ưu tiên câu văn tự nhiên.`,
    },
    {
      id: "keyword-title-start",
      label: "Từ khóa ở nửa đầu tiêu đề",
      weight: 2,
      passed: titlePositions.some((at) => at < normalizedTitle.length / 2),
      hint: "Vị trí bắt đầu của từ khóa nằm trong 50% đầu tiêu đề SEO.",
    },
    {
      id: "h1",
      label: "Một tiêu đề chính",
      weight: 3,
      passed: !!input.title.trim() && !levels.includes(1),
      hint: "Tiêu đề bài là H1; nội dung bắt đầu từ H2.",
    },
    {
      id: "title",
      label: "Độ dài tiêu đề SEO",
      weight: 4,
      passed: [...title].length >= 30 && [...title].length <= 60,
      hint: `${[...title].length} ký tự; hướng dẫn CMS: 30–60 ký tự.`,
    },
    {
      id: "description",
      label: "Độ dài mô tả SEO",
      weight: 4,
      passed: [...description].length >= 70 && [...description].length <= 160,
      hint: `${[...description].length} ký tự; hướng dẫn CMS: 70–160 ký tự.`,
    },
    {
      id: "slug",
      label: "Đường dẫn dễ đọc",
      weight: 2,
      passed: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug) && input.slug.length <= 100,
      hint: "Hướng dẫn CMS: slug ngắn, chữ thường và dấu gạch ngang.",
    },
    {
      id: "body",
      label: "Độ dài nội dung",
      weight: 8,
      passed: lengthRatio === 1,
      ratio: lengthRatio,
      hint: `${wordCount} từ · ${Math.round(lengthRatio * 100)}% điểm độ dài theo các mốc Rank Math. Bài ngắn, nhất là sự kiện, vẫn có thể phù hợp; không kéo dài chỉ để lấy điểm.`,
    },
    {
      id: "headings",
      label: "Có tiêu đề mục H2",
      weight: 3,
      passed: levels.includes(2),
      hint: "Website tự tạo mục lục từ H2/H3 khi có ít nhất hai mục.",
    },
    {
      id: "hierarchy",
      label: "Thứ bậc tiêu đề",
      weight: 2,
      passed:
        levels[0] === 2 &&
        levels.every((level, i) => level >= 2 && (i === 0 || level <= levels[i - 1] + 1)),
      hint: "Hướng dẫn CMS: bắt đầu từ H2, tránh bỏ cấp.",
    },
    {
      id: "links",
      label: "Liên kết nội bộ",
      weight: 4,
      passed: internal,
      hint: "Thêm liên kết tới bài viết hoặc dịch vụ TH Group có liên quan.",
    },
    {
      id: "alt",
      label: "Mô tả ảnh",
      weight: 3,
      passed: alts.length > 0 && alts.every((alt) => !!alt.trim()),
      hint: "Điền alt cho ảnh trong nội dung và chú thích thư viện.",
    },
    {
      id: "cover",
      label: "Ảnh đại diện",
      weight: 3,
      passed: !!input.hasCover,
      hint: "Hướng dẫn CMS: chọn ảnh đại diện phù hợp.",
    },
  ];
  const scored = checks.map((check) => ({
    ...check,
    points: check.weight * (check.ratio ?? Number(check.passed)),
    status: (check.passed ? "pass" : (check.ratio ?? 0) > 0 ? "warning" : "fail") as SeoStatus,
  }));
  return {
    score: Math.round(scored.reduce((sum, check) => sum + check.points, 0)),
    checks: scored,
    keyword: {
      value: keyword,
      count: positions.length,
      density,
      firstWord: positions.length ? words.filter((w) => w.index < positions[0]).length + 1 : null,
    },
    wordCount,
  };
}
