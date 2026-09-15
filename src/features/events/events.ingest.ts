// Agent ingest for Events — the write path marketing.thgfulfill.com uses.
//
// WHY THIS EXISTS SEPARATELY FROM events.actions.ts. The admin server functions
// authenticate with a session cookie and a CSRF origin check; an external tool
// calling from its own backend has neither. This module is the machine-to-
// machine door: a shared bearer token, a narrow body, and one guarantee the
// admin path does not need to make.
//
// THE GUARANTEE: an agent may only ever produce a DRAFT.
//
//   - `status` is not in the accepted body at all — it is hardcoded below, so
//     there is no field for a caller to set and no branch that could publish.
//   - A row that is already `live` is REFUSED (409) rather than updated. An
//     agent re-running its own job must never be able to silently rewrite what
//     is on the public site; an operator unpublishes first, or the agent uses a
//     new slug.
//
// That is CMS_FOUNDATION Rule 12 ("AI components may propose; publishing stays
// operator-stamped") expressed as code rather than as a convention — the same
// stance blog-bot takes by defaulting its posts to status='review'.
//
// Marketing's review + publish step is the existing Event editor at
// /admin/content/events/<slug>; nothing new is needed there.

import { getDb } from "@/core/db/client";
import { auditLog } from "@/core/db/mutations";
import type { AgentEventBody } from "./events.ingest.schema";
import {
  createEvent,
  getEvent,
  updateEvent,
  type EventLocale,
  type EventRow,
} from "./events.service";

/** The disabled service account created by migration 0049. Resolved by email,
 *  not by a hardcoded id, because `users.id` differs per database.
 *
 *  NOT the literal 0 the older system-actor code uses. That value relies on D1
 *  ignoring foreign keys, and it does not: `events.updated_by` REFERENCES
 *  users(id), and a local D1 rejects the insert with
 *  SQLITE_CONSTRAINT_FOREIGNKEY. A real row is also what makes the audit page
 *  render "Marketing Agent" instead of a dangling id. */
const AGENT_ACCOUNT_EMAIL = "marketing-agent@thgfulfill.com";

async function agentActorId(): Promise<number> {
  const row = await getDb()
    .prepare(`SELECT id FROM users WHERE email = ? LIMIT 1`)
    .bind(AGENT_ACCOUNT_EMAIL)
    .first<{ id: number }>();
  if (!row) {
    // Loud rather than silent: falling back to a synthetic id would write rows
    // whose author cannot be resolved, which is the state this account exists to
    // prevent.
    throw new Error(
      `Thiếu tài khoản dịch vụ ${AGENT_ACCOUNT_EMAIL} — chạy migration 0049 trên database này.`,
    );
  }
  return row.id;
}

/** Exactly what `agentEventBodySchema` produces — the input type IS the parsed
 *  body, so a field can never be added to the accepted request without this
 *  function seeing it, nor read here without the schema accepting it.
 *
 *  `cover_url` is an absolute image URL the agent generated or sourced. It is
 *  registered as a media row under the external-URL convention (see
 *  replaceBlogSlides) rather than downloaded — the agent already hosts it, and a
 *  draft cover does not earn a round trip through R2. An operator can swap it
 *  for an uploaded asset in the editor before publishing. */
export type AgentEventInput = AgentEventBody;

export interface AgentEventResult {
  event: EventRow;
  /** "created" or "updated" — lets the agent's own log distinguish a first
   *  submission from a re-run without querying first. */
  outcome: "created" | "updated";
}

/** Reuses the external-URL media convention: r2_key holds the absolute URL, and
 *  `toMediaUrl` passes those through untouched. Deduped on the URL so an agent
 *  re-run does not accumulate media rows. */
async function mediaIdForExternalUrl(
  actorId: number,
  url: string,
  altText: string,
): Promise<number> {
  const db = getDb();
  const existing = await db
    .prepare(`SELECT id FROM media WHERE r2_key = ? LIMIT 1`)
    .bind(url)
    .first<{ id: number }>();
  if (existing) return existing.id;
  const inserted = await db
    .prepare(
      `INSERT INTO media (r2_key, mime, bytes, alt_text, status, uploaded_by)
         VALUES (?, 'image/external', 0, ?, 'ready', ?) RETURNING id`,
    )
    .bind(url, altText.slice(0, 200), actorId)
    .first<{ id: number }>();
  if (!inserted) throw new Error("Không đăng ký được ảnh bìa.");
  return inserted.id;
}

export class LiveEventConflictError extends Error {
  readonly statusCode = 409;
  constructor(slug: string, locale: EventLocale) {
    super(
      `Event "${slug}" (${locale}) đang được xuất bản. Agent không ghi đè nội dung đã lên web — ` +
        `hãy dùng slug khác, hoặc nhờ marketing chuyển Event về nháp trước.`,
    );
    this.name = "LiveEventConflictError";
  }
}

export async function ingestAgentEvent(input: AgentEventInput): Promise<AgentEventResult> {
  const existing = await getEvent(input.slug, input.locale);
  if (existing && existing.status === "live") {
    throw new LiveEventConflictError(input.slug, input.locale);
  }

  const actorId = await agentActorId();
  const cover_media_id = input.cover_url
    ? await mediaIdForExternalUrl(actorId, input.cover_url, input.title)
    : undefined;

  const fields = {
    title: input.title,
    summary: input.summary ?? null,
    body_md: input.body_md ?? null,
    event_date: input.event_date,
    end_date: input.end_date ?? null,
    location: input.location ?? null,
    role: input.role ?? null,
    url: input.url ?? null,
    video_url: input.video_url ?? null,
    seo_title: input.seo_title ?? null,
    seo_description: input.seo_description ?? null,
    // Hardcoded, never taken from the caller. See the module header.
    status: "draft" as const,
    ...(cover_media_id === undefined ? {} : { cover_media_id }),
  };

  const event = existing
    ? await updateEvent(actorId, { id: existing.id, ...fields })
    : await createEvent(actorId, { slug: input.slug, locale: input.locale, ...fields });

  // A second, agent-specific audit entry on top of the one the service writes:
  // the service records WHAT changed, this records WHO proposed it, which is the
  // question marketing will ask when reviewing a draft it did not write.
  await auditLog(actorId, existing ? "update" : "create", "events:agent", event.id, null, {
    agent: input.agent ?? "unknown",
    slug: event.slug,
    locale: event.locale,
  });

  return { event, outcome: existing ? "updated" : "created" };
}
