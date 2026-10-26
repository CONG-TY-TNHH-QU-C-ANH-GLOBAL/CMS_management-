import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { LandingVersionView } from "../landing/landing.service";
import { VersionDetail } from "./LandingCard";

function version(): LandingVersionView {
  return {
    id: "a".repeat(32),
    status: "ready",
    original_name: "test.zip",
    file_count: 1,
    total_bytes: 100,
    created_at: 0,
    processed_at: 0,
    uploader: null,
    last_published_at: null,
    is_live: false,
    preview_url: "/preview",
    critical_count: 0,
    major_count: 0,
    minor_count: 0,
    findings: [],
    report: {
      warnings: [],
      format: {
        mode: "ai",
        note: null,
        applied: [],
        diff: {
          bytesBefore: 100,
          bytesAfter: 100,
          headerReplaced: false,
          consultMarked: 0,
          brandFixed: 0,
          linksFixed: 0,
        },
        ai_usage: { model: "claude-opus-5-5", input_tokens: 10, output_tokens: 10 },
      },
      audit: {
        mode: "ai",
        note: null,
        ai_usage: { model: "deepseek-flash", input_tokens: 10, output_tokens: 10 },
      },
    },
  };
}

test("CMS report shows the actual model separately for format and audit", () => {
  const html = renderToStaticMarkup(<VersionDetail v={version()} />);
  expect(html).toContain("claude-opus-5-5");
  expect(html).toContain("deepseek-flash");
  expect(html).toContain("Kiểm tra nội dung:");
});

test("older reports without model metadata still render", () => {
  const v = version();
  delete v.report.format!.ai_usage;
  delete v.report.audit!.ai_usage;
  const html = renderToStaticMarkup(<VersionDetail v={v} />);
  expect(html).toContain("Định dạng:");
  expect(html).not.toContain("undefined");
  expect(html).not.toContain("deepseek-flash");
});

test("failed audit shows the attempted model and the reason, with escaped model text", () => {
  const v = version();
  v.report.audit = {
    mode: "rules",
    note: "AI trả về sai định dạng",
    ai_usage: { model: "<script>bad</script>", input_tokens: 10, output_tokens: 10 },
  };
  const html = renderToStaticMarkup(<VersionDetail v={v} />);
  expect(html).toContain("chỉ kiểm tra bằng code");
  expect(html).toContain("AI trả về sai định dạng");
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>bad");
});
