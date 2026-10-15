import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { MarkdownPreview } from "./MarkdownPreview";

const ID = "q7NiFssAaRE";
const html = (md: string) => renderToStaticMarkup(<MarkdownPreview markdown={md} />);

test("a bare YouTube link on its own line becomes a player", () => {
  const out = html(`Mở đầu\n\nhttps://youtu.be/${ID}\n\nKết`);
  expect(out).not.toContain("<iframe");
  expect(out).toContain(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
  expect(out).toContain('aria-label="Phát video"');
  expect(out).toContain("Mở đầu");
});

test("a labelled YouTube link alone in a paragraph becomes a player with a caption", () => {
  const out = html(`[Recap sự kiện](https://www.youtube.com/watch?v=${ID})`);
  expect(out).toContain('aria-label="Phát Recap sự kiện"');
  expect(out).not.toContain("<iframe");
  expect(out).toContain("<figcaption");
  expect(out).toContain("Recap sự kiện");
});

test("a YouTube link inside a sentence stays a link", () => {
  const out = html(`Xem [video](https://youtu.be/${ID}) trước khi đăng ký.`);
  expect(out).not.toContain("<iframe");
  expect(out).toContain(`href="https://youtu.be/${ID}"`);
});

test("a YouTube link inside a list item stays a link", () => {
  const out = html(
    `- [Video sự kiện](https://youtu.be/${ID})\n- [Facebook](https://facebook.com/x)`,
  );
  expect(out).not.toContain("<iframe");
});

test("a non-YouTube link alone in a paragraph stays a link", () => {
  const out = html("https://docs.google.com/presentation/d/abc/edit");
  expect(out).not.toContain("<iframe");
  expect(out).toContain('target="_blank"');
});

test("website paths point at thgfulfill.com, not the CMS origin", () => {
  expect(html("[THG Express](/vi/thg-express)")).toContain(
    'href="https://thgfulfill.com/vi/thg-express"',
  );
});

test("empty body shows a hint instead of a blank box", () => {
  expect(html("   ")).toContain("Chưa có nội dung");
});

test("preview includes the same outline and local links as the public article", () => {
  const out = html("## Kho **Mỹ**\n\n### Chi phí\n\n## Kho Mỹ");
  expect(out).toContain('aria-label="Nội dung chính"');
  expect(out).toContain('href="#article-kho-my"');
  expect(out).toContain('id="article-kho-my-2"');
  expect(out).not.toContain('href="#article-kho-my" target=');
});

test("comparison table renders its cells inside a keyboard accessible scroll region", () => {
  const out = html("| Loại | Giá |\n| --- | --- |\n| Kẹp cửa gió | 50.000đ |");
  expect(out).toContain('role="region"');
  expect(out).toContain('tabindex="0"');
  expect(out).toContain("<th>Loại</th>");
  expect(out).toContain("<td>50.000đ</td>");
});
