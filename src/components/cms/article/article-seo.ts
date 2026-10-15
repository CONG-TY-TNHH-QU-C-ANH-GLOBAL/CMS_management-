export interface ArticleSeoInput {
  title: string;
  seoTitle?: string;
  description?: string;
  slug: string;
  markdown: string;
  hasCover?: boolean;
  imageAlts?: string[];
  locale?: string;
  kind?: "blog" | "event";
}

/** Editorial checks only; thresholds are local writing guidance, not Google ranking rules. */
export function evaluateArticleSeo(input: ArticleSeoInput) {
  let fence = "";
  let fenceLength = 0;
  const body = input.markdown
    .split(/\r?\n/)
    .filter((line) => {
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (marker) {
        if (!fence) {
          fence = marker[1][0];
          fenceLength = marker[1].length;
        } else if (marker[1][0] === fence && marker[1].length >= fenceLength && !marker[2].trim())
          fence = "";
        return false;
      }
      return !fence;
    })
    .join("\n")
    .replace(/`+[^`]*`+/g, "");
  const headings = [...body.matchAll(/^ {0,3}(#{1,6})[ \t]+\S.*$/gm)].map((m) => m[1].length);
  const images = [...body.matchAll(/!\[([^\]]*)\]\([^\n]+?\)/g)].map((m) => m[1].trim());
  const alts = [...images, ...(input.imageAlts ?? [])];
  const prose = body
    .replace(/!\[[^\]]*\]\([^\n]+?\)/g, " ")
    .replace(/\[([^\]]*)\]\([^\n]+?\)/g, "$1");
  const words = [
    ...new Intl.Segmenter(input.locale || "vi", { granularity: "word" }).segment(prose),
  ].filter((s) => s.isWordLike).length;
  const title = (input.seoTitle?.trim() || `${input.title.trim()} — THG Fulfill`).trim();
  const description = input.description?.trim() || "";
  const titleLength = [...title].length;
  const descriptionLength = [...description].length;
  const minimum = input.kind === "event" ? 100 : 300;
  const links = [...body.matchAll(/(?<!!)\[[^\]]+\]\(([^\s)]+)(?:\s+[^)]*)?\)/g)];
  const internal = links.some((match) => {
    try {
      const url = new URL(match[1], "https://thgfulfill.com");
      return !match[1].startsWith("#") && url.origin === "https://thgfulfill.com";
    } catch {
      return false;
    }
  });
  const checks = [
    {
      id: "h1",
      label: "Một tiêu đề chính",
      weight: 10,
      passed: !!input.title.trim() && !headings.includes(1),
      hint: "Dùng tiêu đề bài làm H1; các mục trong nội dung bắt đầu từ H2.",
    },
    {
      id: "title",
      label: "Tiêu đề tìm kiếm",
      weight: 15,
      passed: !!input.title.trim() && titleLength >= 30 && titleLength <= 60,
      hint: `${titleLength} ký tự; tham khảo 30–60 ký tự, gồm tên thương hiệu khi dùng tiêu đề mặc định.`,
    },
    {
      id: "description",
      label: "Mô tả tìm kiếm",
      weight: 15,
      passed: descriptionLength >= 70 && descriptionLength <= 160,
      hint: `${descriptionLength} ký tự; tham khảo 70–160 ký tự và mô tả đúng nội dung.`,
    },
    {
      id: "slug",
      label: "Đường dẫn dễ đọc",
      weight: 5,
      passed: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug) && input.slug.length <= 100,
      hint: "Dùng slug ngắn, chữ thường và dấu gạch ngang.",
    },
    {
      id: "body",
      label: "Nội dung đủ thông tin",
      weight: 10,
      passed: words >= minimum,
      hint: `${words} từ; mốc tham khảo ${minimum} từ. Ưu tiên trả lời đủ nhu cầu người đọc.`,
    },
    {
      id: "headings",
      label: "Có tiêu đề mục H2",
      weight: 10,
      passed: headings.includes(2),
      hint: "Chia nội dung bằng H2/H3; website tự tạo mục lục từ các mục này.",
    },
    {
      id: "hierarchy",
      label: "Thứ bậc tiêu đề",
      weight: 5,
      passed:
        headings.length > 0 &&
        headings[0] === 2 &&
        headings.every((level, i) => level >= 2 && (i === 0 || level <= headings[i - 1] + 1)),
      hint: "Bắt đầu từ H2 và tránh bỏ cấp (ví dụ H2 chuyển thẳng H4).",
    },
    {
      id: "links",
      label: "Liên kết nội bộ",
      weight: 10,
      passed: internal,
      hint: "Thêm liên kết tới bài viết hoặc dịch vụ THG có liên quan.",
    },
    {
      id: "alt",
      label: "Mô tả ảnh",
      weight: 10,
      passed: alts.every((alt) => alt.trim().length > 0),
      hint: alts.length
        ? "Điền mô tả cho ảnh trong nội dung và thư viện ảnh."
        : "Chưa có ảnh trong nội dung hoặc thư viện cần kiểm tra alt.",
    },
    {
      id: "cover",
      label: "Ảnh đại diện",
      weight: 10,
      passed: !!input.hasCover,
      hint: "Chọn ảnh đại diện phù hợp để hiển thị trên thẻ bài và khi chia sẻ.",
    },
  ];
  return {
    score: checks.reduce((sum, check) => sum + (check.passed ? check.weight : 0), 0),
    checks,
  };
}
