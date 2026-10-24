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
      format_note: "Bỏ qua bước AI định dạng: chưa cấu hình OPENAI_API_KEY.",
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
  expect(body).toContain("OPENAI_API_KEY");
  expect(body).toContain(
    '<a href="https://cms.thgfulfill.com/admin/content/campaigns/christmas-2026">',
  );
});
