// AI audit step: reads the page and REPORTS content problems to IT. It never
// edits anything. Deterministic checks (landing.checks.ts) already cover what
// code can decide; the prompt (audit.prompt.md) covers the semantic rest —
// copied prices, contradictory origin / delivery claims, wrong dates, etc.

import { z } from "zod";

import type { AiUsage, JsonAiCall, JsonAiRequest } from "./landing.ai";
import { scanTags, visibleText } from "./landing.html";
import type { LandingFinding } from "./landing.types";

// Generous bounds (Claude has a 1M context); they only stop a pathological page.
const TEXT_BUDGET = 150_000;
const SCRIPT_BUDGET = 150_000;

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

const SEVERITIES = ["critical", "major", "minor"] as const;
const AUDIT_CATEGORIES = [
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
] as const;

/** Structured-output schema for the audit step (all fields required, no extras). */
export const AUDIT_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["findings"],
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["severity", "category", "message", "evidence"],
        properties: {
          severity: { type: "string", enum: [...SEVERITIES] },
          category: { type: "string", enum: [...AUDIT_CATEGORIES] },
          message: { type: "string" },
          evidence: { type: "string" },
        },
      },
    },
  },
};

export function buildAuditRequest(
  prompt: string,
  html: string,
  context: AuditContext,
  ruleFindings: LandingFinding[],
): JsonAiRequest {
  const payload = {
    campaign: context,
    already_reported_by_code: ruleFindings.map((f) => `${f.category}: ${f.message}`),
    meta: metaDigest(html),
    visible_text: visibleText(html).slice(0, TEXT_BUDGET),
    scripts: scriptDigest(html),
  };
  return {
    system: prompt,
    user: JSON.stringify(payload),
    schema: AUDIT_OUTPUT_SCHEMA,
    // Reading comprehension over the whole page is the point of this step.
    effort: "high",
    maxTokens: 16000,
    timeoutMs: 120_000,
  };
}

const aiFindingSchema = z.object({
  severity: z.enum(SEVERITIES),
  category: z.enum(AUDIT_CATEGORIES).catch("content"),
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
  ai_usage: AiUsage | null;
}

/** Never throws. Without AI (or on failure) returns no AI findings and says why in `note`. */
export async function runAuditStep(input: {
  html: string;
  prompt: string;
  ai: JsonAiCall | null;
  context: AuditContext;
  ruleFindings: LandingFinding[];
}): Promise<AuditResult> {
  const skipped = (note: string, ai_usage: AiUsage | null = null): AuditResult => ({
    findings: [],
    mode: "rules",
    note,
    ai_usage,
  });
  if (!input.ai) {
    return skipped("Bỏ qua bước AI kiểm tra nội dung: chưa cấu hình ANTHROPIC_API_KEY.");
  }
  try {
    const { parsed, error, usage } = await input.ai(
      buildAuditRequest(input.prompt, input.html, input.context, input.ruleFindings),
    );
    if (!parsed) {
      return skipped(`Bước AI kiểm tra nội dung lỗi: ${error ?? "AI không trả về JSON."}`, usage);
    }
    const findings = parseAuditFindings(parsed);
    if (!findings) {
      return skipped(
        "AI kiểm tra nội dung trả về sai định dạng — chỉ có kết quả kiểm tra bằng code.",
        usage,
      );
    }
    return { findings, mode: "ai", note: null, ai_usage: usage };
  } catch (err) {
    return skipped(
      `Bước AI kiểm tra nội dung lỗi: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
