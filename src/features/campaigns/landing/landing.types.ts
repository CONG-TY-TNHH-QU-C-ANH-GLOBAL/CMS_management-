// Shared shapes for the landing upload pipeline. Pure types + tiny helpers so
// the browser editor can import them without pulling server code.

export type FindingSeverity = "critical" | "major" | "minor";

export const FINDING_SEVERITIES: readonly FindingSeverity[] = ["critical", "major", "minor"];

export type FindingCategory =
  | "asset"
  | "link"
  | "brand"
  | "form"
  | "price"
  | "origin"
  | "delivery"
  | "placeholder"
  | "accessibility"
  | "countdown"
  | "content"
  | "ai";

export interface LandingFinding {
  severity: FindingSeverity;
  category: FindingCategory;
  message: string;
  evidence: string;
  /** "rule" = deterministic check in code; "ai" = the audit prompt. */
  source: "rule" | "ai";
}

export type SeverityCounts = Record<FindingSeverity, number>;

export function countBySeverity(findings: readonly LandingFinding[]): SeverityCounts {
  const counts: SeverityCounts = { critical: 0, major: 0, minor: 0 };
  for (const f of findings) counts[f.severity]++;
  return counts;
}

const RANK: Record<FindingSeverity, number> = { critical: 0, major: 1, minor: 2 };

export function sortFindings(findings: readonly LandingFinding[]): LandingFinding[] {
  return [...findings].sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}

export interface FormatReport {
  /** "ai" = AI edit list applied and validated; "deterministic" = code-only normalization. */
  mode: "ai" | "deterministic";
  /** Why the AI step was skipped or rejected; null when it applied. */
  note: string | null;
  /** Human-readable list of what changed (deterministic notes + applied AI edits). */
  applied: string[];
  diff: DiffSummary;
  /** Tokens the AI call used (null when it was not made). */
  ai_usage?: AiUsageSummary | null;
}

export interface AiUsageSummary {
  model: string;
  input_tokens: number;
  output_tokens: number;
}

export interface DiffSummary {
  bytesBefore: number;
  bytesAfter: number;
  headerReplaced: boolean;
  consultMarked: number;
  brandFixed: number;
  linksFixed: number;
}

export interface LandingReport {
  format: FormatReport | null;
  audit: { mode: "ai" | "rules"; note: string | null; ai_usage?: AiUsageSummary | null } | null;
  warnings: string[];
}
