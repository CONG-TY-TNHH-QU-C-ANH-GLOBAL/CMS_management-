// Tool catalog. Each entry maps to one underlying mutation/service function.
// READ tools execute immediately and return JSON to the model. WRITE tools
// (propose_*) build a preview snapshot and insert an ai_change_requests row
// — they do NOT touch content tables until the operator clicks Approve.

import { z } from "zod";

import { createChangeRequest, type ChatMessageRow } from "./copilot.service";
import type { OpenAiToolDef, OpenAiToolCall } from "./copilot.openai";

// Service modules — read functions are safe to call directly here. Write
// functions are referenced by `mutation_name` and dispatched in copilot.execute.ts
// when the operator approves.
import {
  listServices,
  listFaqs,
  listTestimonials,
  listContactLocations,
  listIntegrations,
  listMarqueeImages,
} from "@/features/content";
import { listHomepageBlocks } from "@/features/homepage";
import { getSiteSettings } from "@/features/settings";
import { listCareersJobs } from "@/features/careers";

// ───────────────────────── Tool dispatcher ─────────────────────────

export interface ToolHandlerCtx {
  userId: number;
  sessionId: number;
  message: ChatMessageRow;
  toolCall: OpenAiToolCall;
}

export interface ToolResult {
  /** Stringified output sent back to the model as the tool result message. */
  output: string;
  /** If the tool created a change request, its id (so the UI can render the card). */
  changeRequestId?: number;
}

const LOCALE = z.enum(["vi", "en", "zh"]);

// Schemas for arguments — strict enough that hallucinated fields trip Zod
// before any DB interaction. Each propose_* schema is mirrored on the
// approve side too (defense in depth).
const SCHEMAS = {
  list_services: z.object({}).strict(),
  list_faqs: z.object({ scope: z.string().default("home") }).strict(),
  list_testimonials: z.object({}).strict(),
  list_contact_locations: z.object({}).strict(),
  list_integrations: z.object({}).strict(),
  list_marquee_images: z.object({}).strict(),
  list_homepage_blocks: z.object({ locale: LOCALE }).strict(),
  list_jobs: z.object({}).strict(),
  get_site_settings: z.object({}).strict(),
  get_terminology: z.object({}).strict(),

  propose_upsert_homepage_block: z.object({
    locale: LOCALE,
    kind: z.enum([
      "hero", "trust", "services_grid", "about_video", "marquee",
      "sellers", "process", "advantages", "integrations",
      "testimonials", "faq", "contact",
    ]),
    payload: z.record(z.string()),
    position: z.number().int().min(0).optional(),
  }).strict(),

  propose_update_service_i18n: z.object({
    service_id: z.string().min(1),
    locale: LOCALE,
    name: z.string().min(1),
    tagline: z.string().nullable().optional(),
    hero_eyebrow: z.string().nullable().optional(),
    hero_title: z.string().nullable().optional(),
    hero_sub: z.string().nullable().optional(),
    cta_text: z.string().nullable().optional(),
    cta_url: z.string().nullable().optional(),
    body_md: z.string().nullable().optional(),
  }).strict(),

  propose_replace_service_bullets: z.object({
    service_id: z.string().min(1),
    locale: LOCALE,
    bullets: z.array(z.string().min(1)).max(20),
  }).strict(),

  propose_create_faq: z.object({
    scope: z.string().min(1).default("home"),
    locale: LOCALE,
    question: z.string().min(1).max(500),
    answer: z.string().min(1).max(4000),
    position: z.number().int().min(0).optional(),
  }).strict(),

  propose_update_faq: z.object({
    id: z.number().int().positive(),
    question: z.string().min(1).max(500).optional(),
    answer: z.string().min(1).max(4000).optional(),
    position: z.number().int().min(0).optional(),
  }).strict(),

  propose_delete_faq: z.object({
    id: z.number().int().positive(),
  }).strict(),

  propose_create_testimonial: z.object({
    locale: LOCALE,
    quote: z.string().min(1).max(2000),
    author_name: z.string().min(1).max(120),
    author_role: z.string().nullable().optional(),
    avatar_media_id: z.number().int().positive().nullable().optional(),
    position: z.number().int().min(0).optional(),
  }).strict(),

  propose_update_testimonial: z.object({
    id: z.number().int().positive(),
    quote: z.string().min(1).max(2000).optional(),
    author_name: z.string().min(1).max(120).optional(),
    author_role: z.string().nullable().optional(),
    position: z.number().int().min(0).optional(),
  }).strict(),

  propose_update_site_settings: z.object({
    brand_name: z.string().max(100).optional(),
    contact_phone: z.string().max(50).nullable().optional(),
    contact_email: z.string().email().max(254).nullable().optional(),
    facebook_url: z.string().url().max(500).nullable().optional(),
    about_video_url: z.string().url().max(500).nullable().optional(),
  }).strict(),

  propose_save_terminology: z.object({
    groups: z.array(z.object({
      title: z.object({ vi: z.string(), en: z.string(), zh: z.string() }),
      terms: z.array(z.object({
        term: z.object({ vi: z.string(), en: z.string(), zh: z.string() }),
        desc: z.object({ vi: z.string(), en: z.string(), zh: z.string() }),
      })),
    })),
  }).strict(),
} as const;

export type ToolName = keyof typeof SCHEMAS;
export const ALL_TOOL_NAMES = Object.keys(SCHEMAS) as ToolName[];

export function getSchema(name: ToolName) {
  return SCHEMAS[name];
}

export function isProposeTool(name: string): boolean {
  return name.startsWith("propose_");
}

// ───────────────────────── OpenAI tool definitions ─────────────────────────

function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  // Minimal Zod → JSON Schema converter — covers the field types we actually
  // use in this catalog. For complex schemas (terminology), we hand-write
  // the JSON Schema below.
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [k, v] of Object.entries(shape)) {
      properties[k] = zodToJsonSchema(v);
      if (!(v instanceof z.ZodOptional) && !(v instanceof z.ZodDefault)) {
        required.push(k);
      }
    }
    return {
      type: "object",
      properties,
      ...(required.length ? { required } : {}),
      additionalProperties: false,
    };
  }
  if (schema instanceof z.ZodOptional) return zodToJsonSchema(schema.unwrap());
  if (schema instanceof z.ZodDefault) return zodToJsonSchema(schema._def.innerType);
  if (schema instanceof z.ZodNullable) {
    const inner = zodToJsonSchema(schema.unwrap()) as { type?: string };
    return { ...inner, type: [inner.type, "null"] };
  }
  if (schema instanceof z.ZodEnum) {
    return { type: "string", enum: schema.options };
  }
  if (schema instanceof z.ZodString) return { type: "string" };
  if (schema instanceof z.ZodNumber) return { type: "number" };
  if (schema instanceof z.ZodBoolean) return { type: "boolean" };
  if (schema instanceof z.ZodArray) {
    return { type: "array", items: zodToJsonSchema(schema.element) };
  }
  if (schema instanceof z.ZodRecord) {
    return { type: "object", additionalProperties: { type: "string" } };
  }
  return { type: "string" };
}

const DESCRIPTIONS: Record<ToolName, string> = {
  list_services: "Liệt kê toàn bộ services (THG Fulfill / Express / Warehouse / Order). Trả về id, status, gallery, videos, products kèm tất cả i18n.",
  list_faqs: "Lấy danh sách FAQ theo scope (default 'home'). Trả về id, locale, question, answer, position.",
  list_testimonials: "Lấy toàn bộ testimonials (đánh giá khách hàng).",
  list_contact_locations: "Lấy toàn bộ contact locations (văn phòng, kho, hotline, email).",
  list_integrations: "Lấy toàn bộ integrations (Shopify, Etsy, TikTok…).",
  list_marquee_images: "Lấy toàn bộ banner cuộn trang chủ.",
  list_homepage_blocks: "Lấy toàn bộ block của trang chủ theo locale (hero, trust, process, faq, contact, …).",
  list_jobs: "Lấy toàn bộ tin tuyển dụng (career postings).",
  get_site_settings: "Lấy site settings singleton: brand_name, contact, social, tracking IDs.",
  get_terminology: "Lấy bảng thuật ngữ (glossary) từ site_settings — array nhóm × terms × {vi,en,zh}.",

  propose_upsert_homepage_block: "Đề xuất cập nhật/insert 1 homepage_block cho 1 locale. Phải Approve. Payload là object string→string (vd hero: {title, sub, cta1, cta2}).",
  propose_update_service_i18n: "Đề xuất cập nhật i18n của 1 service cho 1 locale. Phải Approve. Chỉ truyền field cần đổi.",
  propose_replace_service_bullets: "Đề xuất thay toàn bộ bullets của 1 service tại 1 locale. Phải Approve.",
  propose_create_faq: "Đề xuất tạo FAQ mới. Phải Approve.",
  propose_update_faq: "Đề xuất sửa FAQ theo id. Phải Approve.",
  propose_delete_faq: "Đề xuất xoá 1 FAQ theo id. Phải Approve. KHÔNG xoá hàng loạt.",
  propose_create_testimonial: "Đề xuất tạo testimonial mới. Phải Approve.",
  propose_update_testimonial: "Đề xuất sửa testimonial theo id. Phải Approve.",
  propose_update_site_settings: "Đề xuất cập nhật site settings (brand, contact, social). Phải Approve. CHỈ admin.",
  propose_save_terminology: "Đề xuất overwrite toàn bộ bảng thuật ngữ. Phải Approve. Cần đầy đủ groups + terms × 3 locale.",
};

export function buildToolDefs(): OpenAiToolDef[] {
  return ALL_TOOL_NAMES.map((name) => ({
    type: "function" as const,
    function: {
      name,
      description: DESCRIPTIONS[name],
      parameters: zodToJsonSchema(SCHEMAS[name]),
    },
  }));
}

// ───────────────────────── Read tool execution ─────────────────────────

async function executeReadTool(name: ToolName, args: unknown): Promise<unknown> {
  switch (name) {
    case "list_services": {
      const rows = await listServices();
      return rows.map((r) => ({
        id: r.id, position: r.position, status: r.status,
        i18n: r.i18n, bullets: r.bullets,
        gallery: r.gallery, videos: r.videos, products: r.products,
      }));
    }
    case "list_faqs": {
      const a = SCHEMAS.list_faqs.parse(args);
      return await listFaqs(a.scope);
    }
    case "list_testimonials": return await listTestimonials();
    case "list_contact_locations": return await listContactLocations();
    case "list_integrations": return await listIntegrations();
    case "list_marquee_images": return await listMarqueeImages();
    case "list_homepage_blocks": {
      const a = SCHEMAS.list_homepage_blocks.parse(args);
      return await listHomepageBlocks(a.locale);
    }
    case "list_jobs": return await listCareersJobs({});
    case "get_site_settings": {
      const row = await getSiteSettings();
      if (!row) return null;
      // Strip sensitive fields before returning to the model
      const { remote_area_links_json: _r, terminology_json: _t, ...rest } = row;
      return rest;
    }
    case "get_terminology": {
      const row = await getSiteSettings();
      if (!row?.terminology_json) return [];
      try { return JSON.parse(row.terminology_json); } catch { return []; }
    }
    default:
      throw new Error(`Read tool '${name}' not implemented`);
  }
}

// ───────────────────────── Preview builder ─────────────────────────

async function buildPreview(name: ToolName, args: unknown): Promise<{
  before: unknown;
  after: unknown;
  summary: string;
}> {
  // Fetch current state for diff display. Only used by the UI; doesn't gate
  // execution. Best-effort — errors fall back to {before: null}.
  try {
    switch (name) {
      case "propose_upsert_homepage_block": {
        const a = SCHEMAS.propose_upsert_homepage_block.parse(args);
        const blocks = await listHomepageBlocks(a.locale);
        const existing = blocks.find((b) => b.kind === a.kind);
        return {
          before: existing?.payload ?? null,
          after: a.payload,
          summary: `Homepage block ${a.kind} (${a.locale})`,
        };
      }
      case "propose_update_service_i18n": {
        const a = SCHEMAS.propose_update_service_i18n.parse(args);
        const services = await listServices();
        const svc = services.find((s) => s.id === a.service_id);
        const before = svc?.i18n[a.locale] ?? null;
        return {
          before,
          after: { ...(before ?? {}), ...a },
          summary: `Service ${a.service_id} i18n (${a.locale})`,
        };
      }
      case "propose_replace_service_bullets": {
        const a = SCHEMAS.propose_replace_service_bullets.parse(args);
        const services = await listServices();
        const svc = services.find((s) => s.id === a.service_id);
        return {
          before: svc?.bullets[a.locale] ?? [],
          after: a.bullets,
          summary: `Service ${a.service_id} bullets (${a.locale})`,
        };
      }
      case "propose_create_faq": {
        const a = SCHEMAS.propose_create_faq.parse(args);
        return { before: null, after: a, summary: `FAQ mới (${a.locale}) scope=${a.scope}` };
      }
      case "propose_update_faq": {
        const a = SCHEMAS.propose_update_faq.parse(args);
        const all = await listFaqs("home"); // fallback scope; UI shows id anyway
        const existing = all.find((f) => f.id === a.id);
        return { before: existing, after: { ...existing, ...a }, summary: `FAQ #${a.id}` };
      }
      case "propose_delete_faq": {
        const a = SCHEMAS.propose_delete_faq.parse(args);
        const all = await listFaqs("home");
        const existing = all.find((f) => f.id === a.id);
        return { before: existing, after: null, summary: `Xoá FAQ #${a.id}` };
      }
      case "propose_create_testimonial": {
        const a = SCHEMAS.propose_create_testimonial.parse(args);
        return { before: null, after: a, summary: `Testimonial mới (${a.locale})` };
      }
      case "propose_update_testimonial": {
        const a = SCHEMAS.propose_update_testimonial.parse(args);
        const all = await listTestimonials();
        const existing = all.find((t) => t.id === a.id);
        return { before: existing, after: { ...existing, ...a }, summary: `Testimonial #${a.id}` };
      }
      case "propose_update_site_settings": {
        const a = SCHEMAS.propose_update_site_settings.parse(args);
        const before = await getSiteSettings();
        return { before, after: { ...before, ...a }, summary: "Site settings" };
      }
      case "propose_save_terminology": {
        const a = SCHEMAS.propose_save_terminology.parse(args);
        const before = await getSiteSettings();
        let parsed: unknown = null;
        try { parsed = before?.terminology_json ? JSON.parse(before.terminology_json) : null; } catch { /* ignore */ }
        return { before: parsed, after: a.groups, summary: `Bảng thuật ngữ — ${a.groups.length} nhóm` };
      }
      default:
        return { before: null, after: args, summary: name };
    }
  } catch (err) {
    return {
      before: null,
      after: args,
      summary: `${name} (preview build failed: ${err instanceof Error ? err.message : "unknown"})`,
    };
  }
}

// ───────────────────────── Main dispatcher ─────────────────────────

export async function dispatchToolCall(ctx: ToolHandlerCtx): Promise<ToolResult> {
  const name = ctx.toolCall.function.name as ToolName;
  if (!(name in SCHEMAS)) {
    return { output: JSON.stringify({ error: `Unknown tool: ${name}` }) };
  }

  let args: unknown;
  try {
    args = JSON.parse(ctx.toolCall.function.arguments || "{}");
  } catch {
    return { output: JSON.stringify({ error: "Invalid JSON arguments" }) };
  }

  // Validate against the schema (catches AI hallucination of bad fields).
  const parsed = SCHEMAS[name].safeParse(args);
  if (!parsed.success) {
    return {
      output: JSON.stringify({
        error: "Schema validation failed",
        issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      }),
    };
  }

  if (isProposeTool(name)) {
    // Build preview snapshot + create a pending change_request row
    const preview = await buildPreview(name, parsed.data);
    const cr = await createChangeRequest({
      session_id: ctx.sessionId,
      message_id: ctx.message.id,
      tool_call_id: ctx.toolCall.id,
      mutation_name: name,
      args_json: JSON.stringify(parsed.data),
      preview_json: JSON.stringify(preview),
    });
    return {
      output: JSON.stringify({
        change_request_id: cr.id,
        status: "pending_approval",
        summary: preview.summary,
        message: "Đã gửi đề xuất cho operator duyệt — chưa áp dụng.",
      }),
      changeRequestId: cr.id,
    };
  }

  // Read tool — execute immediately
  try {
    const result = await executeReadTool(name, parsed.data);
    return { output: JSON.stringify(result) };
  } catch (err) {
    return {
      output: JSON.stringify({
        error: err instanceof Error ? err.message : "Tool execution failed",
      }),
    };
  }
}
