// Request body the agent ingest route accepts. Kept in its OWN module, separate
// from events.ingest.ts, because that module imports the D1 client — and the
// single most important property of this schema (that it cannot carry a publish
// instruction) deserves a test that needs no Worker runtime and no mocking to
// state.

import { z } from "zod";

const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải theo định dạng YYYY-MM-DD.");
const optionalText = (max: number) => z.string().max(max).nullable().optional();
const optionalLink = z.string().url().max(500).nullable().optional();

/**
 * NOTE THE FIELD THAT IS NOT HERE: `status`.
 *
 * Its absence is the mechanism, not an oversight. zod strips unknown keys by
 * default, so a caller sending `"status": "live"` has it dropped during parse
 * and the handler downstream never sees it — there is no field to honour and no
 * branch that could publish. The published value is hardcoded in
 * `ingestAgentEvent`. See that module's header for the full rule.
 */
export const agentEventBodySchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Đường dẫn chỉ gồm chữ thường, số và dấu gạch ngang."),
  /** vi is the canonical source language across this CMS, so an agent that omits
   *  it gets the language marketing actually reviews. */
  locale: z.enum(["en", "vi", "zh"]).default("vi"),
  title: z.string().min(1).max(200),
  event_date: ISO_DATE,
  summary: optionalText(500),
  body_md: optionalText(60_000),
  end_date: ISO_DATE.nullable().optional(),
  location: optionalText(200),
  role: optionalText(120),
  url: optionalLink,
  video_url: optionalLink,
  cover_url: optionalLink,
  seo_title: optionalText(200),
  seo_description: optionalText(300),
  /** Free-text identity of the calling agent, recorded in the audit log so a
   *  reviewer can see which job proposed the draft. */
  agent: optionalText(80),
});

export type AgentEventBody = z.infer<typeof agentEventBodySchema>;
