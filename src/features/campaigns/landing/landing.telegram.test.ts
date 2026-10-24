import { expect, test } from "bun:test";

import { EVENT_TYPES, isKnownEventType } from "@/features/telegram/telegram.events";
import { formatEvent } from "@/features/telegram/telegram.formatters";

test("landing_review is an infra event with an escaped, linked report", () => {
  expect(isKnownEventType("landing_review")).toBe(true);
  expect(EVENT_TYPES.find((e) => e.type === "landing_review")?.kind).toBe("infra");

  const body = formatEvent({
    event_type: "landing_review",
    idempotency_key: "landing_review:abc",
    payload: {
      campaign_title: "Christmas <2026> & co",
      campaign_slug: "christmas-2026",
      version_id: "0123456789abcdef0123456789abcdef",
      uploader: "Marketing",
      critical: 1,
      major: 4,
      minor: 2,
      format_mode: "deterministic",
      format_note: "Bỏ qua bước AI định dạng: chưa cấu hình ANTHROPIC_API_KEY.",
      audit_mode: "rules",
      audit_note: "Bỏ qua bước AI kiểm tra nội dung.",
      top: [{ severity: "critical", message: "Thiếu 31 tệp <img>" }],
      editor_url: "https://cms.thgfulfill.com/admin/content/campaigns/christmas-2026",
      preview_url: "https://lp.thgfulfill.com/_preview/0123456789abcdef0123456789abcdef/",
    },
  });
  expect(body).toContain("Christmas &lt;2026&gt; &amp; co");
  expect(body).toContain("🛑 1 nghiêm trọng · ⚠️ 4 quan trọng · ℹ️ 2 nhỏ");
  expect(body).toContain("<code>01234567</code> · Marketing");
  expect(body).toContain("🛑 Thiếu 31 tệp &lt;img&gt;");
  expect(body).toContain("ANTHROPIC_API_KEY");
  expect(body).toContain(
    '<a href="https://cms.thgfulfill.com/admin/content/campaigns/christmas-2026">',
  );
});

test("uploaded-page text cannot inject Telegram HTML: only the formatter's own tags and links survive", () => {
  // Every free-text field can carry text copied from the uploaded HTML (titles, AI messages
  // quoting the page, notes). parse_mode is HTML, so an unescaped "<" would let the page add
  // links/formatting to IT's channel or break the message so Telegram rejects it.
  const evil = '</code></b><a href="https://evil.example/phish">Bấm</a><b>&amp;</b>&lt;x';
  const body = formatEvent({
    event_type: "landing_review",
    idempotency_key: "landing_review:x",
    payload: {
      campaign_title: evil,
      campaign_slug: "christmas-2026",
      version_id: "0123456789abcdef0123456789abcdef",
      uploader: evil,
      critical: 1,
      major: 0,
      minor: 0,
      format_mode: "deterministic",
      format_note: evil,
      audit_mode: "rules",
      audit_note: evil,
      top: [
        { severity: "critical", message: evil },
        { severity: '"><a href="x">', message: "ok" },
      ],
      editor_url: "https://cms.thgfulfill.com/admin/content/campaigns/christmas-2026",
      preview_url: "https://lp.thgfulfill.com/_preview/0123456789abcdef0123456789abcdef/",
    },
  });
  const tags = [...body.matchAll(/<\/?([a-z]+)\b[^>]*>/gi)].map((m) => m[0]);
  const allowed = new Set(["<b>", "</b>", "<i>", "</i>", "<code>", "</code>", "</a>"]);
  const links = tags.filter((t) => t.startsWith("<a "));
  expect(links).toEqual([
    '<a href="https://lp.thgfulfill.com/_preview/0123456789abcdef0123456789abcdef/">',
    '<a href="https://cms.thgfulfill.com/admin/content/campaigns/christmas-2026">',
  ]);
  expect(tags.filter((t) => !t.startsWith("<a ") && !allowed.has(t))).toEqual([]);
  // Balanced: each opening tag has its closing tag.
  for (const name of ["b", "i", "code", "a"]) {
    const open = tags.filter((t) => t.startsWith(`<${name}>`) || t.startsWith(`<${name} `)).length;
    expect({ name, open }).toEqual({ name, open: tags.filter((t) => t === `</${name}>`).length });
  }
  // Every "&" starts one of the entities Telegram's HTML mode accepts.
  expect(body.match(/&(?!amp;|lt;|gt;|quot;)/g)).toBeNull();
  expect(body).not.toContain('evil.example/phish">');
  expect(body).toContain("&lt;/code&gt;&lt;/b&gt;&lt;a href=");
});
