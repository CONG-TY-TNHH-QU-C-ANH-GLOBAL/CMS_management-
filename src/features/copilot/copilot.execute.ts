// Executes an approved change_request by re-validating args (defense in
// depth) and calling the underlying service mutation. Each mutation already
// runs auditLog + bumpCmsRev internally, so we don't repeat that here.

import {
  appendMessage,
  getChangeRequest,
  markChangeRequestExecuted,
  markChangeRequestFailed,
  type ChangeRequestRow,
} from "./copilot.service";
import { getSchema, type ToolName } from "./copilot.tools";

import {
  createFaq, updateFaq, deleteFaq,
  createTestimonial, updateTestimonial,
  upsertServiceI18n, replaceServiceBullets,
} from "@/features/content";
import { upsertHomepageBlock } from "@/features/homepage";
import { updateSiteSettings } from "@/features/settings";

export interface ExecuteResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Execute the mutation referenced by an approved change_request. Caller must
 * have already gated by requireSession + ownership check.
 */
export async function executeChangeRequest(
  actorId: number,
  request: ChangeRequestRow,
): Promise<ExecuteResult> {
  const name = request.mutation_name as ToolName;
  const schema = getSchema(name);
  if (!schema) {
    await markChangeRequestFailed(request.id, `Unknown mutation: ${name}`);
    return { ok: false, error: `Unknown mutation: ${name}` };
  }

  let args: unknown;
  try {
    args = JSON.parse(request.args_json);
  } catch {
    await markChangeRequestFailed(request.id, "Corrupt args_json");
    return { ok: false, error: "Corrupt args_json" };
  }

  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    await markChangeRequestFailed(request.id, `Re-validation failed: ${detail}`);
    return { ok: false, error: `Re-validation failed: ${detail}` };
  }

  try {
    let result: unknown;
    switch (name) {
      case "propose_upsert_homepage_block": {
        const a = parsed.data as { locale: "vi" | "en" | "zh"; kind: import("@/features/homepage").HomepageBlockKind; payload: Record<string, string>; position?: number };
        result = await upsertHomepageBlock(actorId, a);
        break;
      }
      case "propose_update_service_i18n": {
        const a = parsed.data as {
          service_id: string; locale: "vi" | "en" | "zh"; name: string;
          tagline?: string | null; hero_eyebrow?: string | null;
          hero_title?: string | null; hero_sub?: string | null;
          cta_text?: string | null; cta_url?: string | null;
          body_md?: string | null;
        };
        result = await upsertServiceI18n(actorId, a);
        break;
      }
      case "propose_replace_service_bullets": {
        const a = parsed.data as { service_id: string; locale: "vi" | "en" | "zh"; bullets: string[] };
        result = await replaceServiceBullets(actorId, a);
        break;
      }
      case "propose_create_faq": {
        const a = parsed.data as { scope: string; locale: "vi" | "en" | "zh"; question: string; answer: string; position?: number };
        result = await createFaq(actorId, { ...a, position: a.position ?? 0 });
        break;
      }
      case "propose_update_faq": {
        const a = parsed.data as { id: number; question?: string; answer?: string; position?: number };
        result = await updateFaq(actorId, a);
        break;
      }
      case "propose_delete_faq": {
        const a = parsed.data as { id: number };
        await deleteFaq(actorId, a.id);
        result = { id: a.id, deleted: true };
        break;
      }
      case "propose_create_testimonial": {
        const a = parsed.data as { locale: "vi" | "en" | "zh"; quote: string; author_name: string; author_role?: string | null; avatar_media_id?: number | null; position?: number };
        result = await createTestimonial(actorId, { ...a, position: a.position ?? 0 });
        break;
      }
      case "propose_update_testimonial": {
        const a = parsed.data as { id: number; quote?: string; author_name?: string; author_role?: string | null; position?: number };
        result = await updateTestimonial(actorId, a);
        break;
      }
      case "propose_update_site_settings": {
        const a = parsed.data as Record<string, unknown>;
        await updateSiteSettings(a, actorId);
        result = { ok: true };
        break;
      }
      case "propose_save_terminology": {
        const a = parsed.data as { groups: unknown[] };
        await updateSiteSettings({ terminology_json: JSON.stringify(a.groups) }, actorId);
        result = { ok: true, groupCount: a.groups.length };
        break;
      }
      default:
        throw new Error(`No executor wired for ${name}`);
    }

    await markChangeRequestExecuted(request.id);
    return { ok: true, result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await markChangeRequestFailed(request.id, msg);
    return { ok: false, error: msg };
  }
}

/**
 * Append a 'tool' message representing the operator's decision so the model
 * sees it in subsequent rounds (e.g. "I rejected — try a different wording").
 */
export async function recordDecisionInChat(
  sessionId: number,
  toolCallId: string,
  decision: "approved" | "rejected" | "executed" | "failed",
  detail?: string,
): Promise<void> {
  await appendMessage({
    session_id: sessionId,
    role: "tool",
    content: JSON.stringify({ decision, ...(detail ? { detail } : {}) }),
    tool_call_id: toolCallId,
  });
}

export async function loadOwnedChangeRequest(
  userId: number,
  changeRequestId: number,
): Promise<ChangeRequestRow | null> {
  const cr = await getChangeRequest(changeRequestId);
  if (!cr) return null;
  // Cross-check the session belongs to this user (avoid IDOR via guessed id)
  const { getSession } = await import("./copilot.service");
  const session = await getSession(userId, cr.session_id);
  if (!session) return null;
  return cr;
}
