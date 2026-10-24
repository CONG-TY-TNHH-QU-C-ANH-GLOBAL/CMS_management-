// AI audit step: reads the page and REPORTS content problems to IT. It never
// edits anything. Deterministic checks (landing.checks.ts) already cover what
// code can decide; the prompt (audit.prompt.md) covers the semantic rest —
// copied prices, contradictory origin / delivery claims, wrong dates, etc.

import { z } from "zod";

import type { JsonAiCall, PromptMessage } from "./landing.format";
import { scanTags, visibleText } from "./landing.html";
import type { LandingFinding } from "./landing.types";

const TEXT_BUDGET = 30_000;
const SCRIPT_BUDGET = 25_000;

export interface AuditContext {
  campaignTitle: string;
  startDate: string | null;
  endDate: string | null;
  /** YYYY-MM-DD, Asia/Ho_Chi_Minh. */
  today: string;
}

/** Inline script bodies (product data often lives there), longest-first within budget. */
function scriptDigest(html: string): string {
  const tags = scanTags(html);
  const bodies: string[] = [];
  tags.forEach((tag, i) => {
    if (tag.kind !== "start" || tag.name !== "script") return;
    const close = tags[i + 1];
    if (close?.kind === "end") {
      const body = html.slice(tag.end, close.start).trim();
      if (body) bodies.push(body);
    }
  });
  return bodies.join("\n/* --- */\n").slice(0, SCRIPT_BUDGET);
}

function metaDigest(html: string): string {
  const out: string[] = [];
  const re =
    /<(title)[^>]*>([\s\S]*?)<\/title>|<meta\s[^>]*(?:name|property)=["']([^"']+)["'][^>]*content=["']([^"']*)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(m[1] ? `title: ${m[2].trim()}` : `${m[3]}: ${m[4]}`);
  return out.join("\n");
}

export function buildAuditMessages(
  prompt: string,
  html: string,
  context: AuditContext,
  ruleFindings: LandingFinding[],
): PromptMessage[] {
  const payload = {
    campaign: context,
    already_reported_by_code: ruleFindings.map((f) => `${f.category}: ${f.message}`),
    meta: metaDigest(html),
    visible_text: visibleText(html).slice(0, TEXT_BUDGET),
    scripts: scriptDigest(html),
  };
  return [
    { role: "system", content: prompt },
    { role: "user", content: JSON.stringify(payload) },
  ];
}

const aiFindingSchema = z.object({
  severity: z.enum(["critical", "major", "minor"]),
  category: z
    .enum([
      "price",
      "origin",
      "delivery",
      "content",
      "placeholder",
      "link",
      "brand",
      "form",
      "accessibility",
      "countdown",
      "asset",
    ])
    .catch("content"),
  message: z.string().min(1).max(600),
  evidence: z.string().max(600).default(""),
});

export function parseAuditFindings(parsed: Record<string, unknown>): LandingFinding[] | null {
  const list = z.object({ findings: z.array(z.unknown()).max(100) }).safeParse(parsed);
  if (!list.success) return null;
  const out: LandingFinding[] = [];
  for (const raw of list.data.findings) {
    const item = aiFindingSchema.safeParse(raw);
    if (item.success) out.push({ ...item.data, source: "ai" });
  }
  return out.slice(0, 40);
}

export interface AuditResult {
  findings: LandingFinding[];
  mode: "ai" | "rules";
  note: string | null;
}

/** Never throws. Without AI (or on failure) returns no AI findings and says why in `note`. */
export async function runAuditStep(input: {
  html: string;
  prompt: string;
  ai: JsonAiCall | null;
  context: AuditContext;
  ruleFindings: LandingFinding[];
}): Promise<AuditResult> {
  const skipped = (note: string): AuditResult => ({ findings: [], mode: "rules", note });
  if (!input.ai) return skipped("Bỏ qua bước AI kiểm tra nội dung: chưa cấu hình OPENAI_API_KEY.");
  try {
    const { parsed, error } = await input.ai(
      buildAuditMessages(input.prompt, input.html, input.context, input.ruleFindings),
    );
    if (!parsed)
      return skipped(`Bỏ qua bước AI kiểm tra nội dung: ${error ?? "AI không trả về JSON."}`);
    const findings = parseAuditFindings(parsed);
    if (!findings)
      return skipped(
        "AI kiểm tra nội dung trả về sai định dạng — chỉ có kết quả kiểm tra bằng code.",
      );
    return { findings, mode: "ai", note: null };
  } catch (err) {
    return skipped(
      `Bỏ qua bước AI kiểm tra nội dung: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
