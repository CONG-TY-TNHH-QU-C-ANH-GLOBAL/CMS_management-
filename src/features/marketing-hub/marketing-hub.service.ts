import { env } from "cloudflare:workers";
import "@/core/db/env";
import { getDb } from "@/core/db/client";
import { canonical, digest, hmac } from "./marketing-hub.crypto";
import {
  hubEnvelopeSchema,
  hubEventSchema,
  hubBlogSchema,
  hubReadResponseSchema,
  hubMediaSchema,
  hubRetrySchema,
  hubPreviewSchema,
  hubPreviewBlogSchema,
} from "./marketing-hub.schemas";
import {
  atomic,
  command,
  contentTable,
  getHubContent,
  guard,
  isConflict,
  saveCommand,
  serviceActor,
} from "./marketing-hub.repository";

export function fail(code: string, statusCode: number): never {
  throw Object.assign(new Error(code), { statusCode });
}
export function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
async function replay(id: string, hash: string): Promise<Response | null> {
  const existing = await command(id);
  if (!existing) return null;
  if (existing.request_hash !== hash) fail("IDEMPOTENCY_KEY_REUSED", 409);
  return new Response(existing.response_json, {
    status: existing.response_status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
export function configuredHttps(value: string | undefined): URL | null {
  try {
    const url = new URL(value || "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      url.hostname === "localhost" ||
      url.hostname.endsWith(".local") ||
      url.hostname.endsWith(".internal") ||
      url.hostname.includes(":") ||
      /^\d+(\.\d+){3}$/.test(url.hostname)
    )
      return null;
    return url;
  } catch {
    return null;
  }
}
export function publicUrl(kind: "event" | "blog", locale: string, slug: string): string | null {
  const url = configuredHttps(env.MARKETING_HUB_PUBLIC_ORIGIN);
  if (!url) return null;
  url.pathname = `/${locale}/${kind === "event" ? "events" : "blog"}/${slug}`;
  url.search = "";
  return url.toString();
}

function previewUrl(locale: string, token: string): string | null {
  const url = configuredHttps(env.MARKETING_HUB_PUBLIC_ORIGIN);
  if (!url) return null;
  url.pathname = `/${locale}/blog-preview/${token}`;
  url.search = "";
  return url.toString();
}

async function previewToken(payload: {
  externalId: string;
  versionId: string;
  payloadHash: string;
  expiresAt: string;
}) {
  if (!env.MARKETING_HUB_PREVIEW_SECRET) fail("MARKETING_HUB_PREVIEW_DISABLED", 503);
  return hmac(
    env.MARKETING_HUB_PREVIEW_SECRET,
    `${payload.externalId}\n${payload.versionId}\n${payload.payloadHash}\n${payload.expiresAt}`,
  );
}

export async function ingestHubPreview(raw: string): Promise<Response> {
  const payload = hubPreviewSchema.parse(JSON.parse(raw));
  const { payloadHash, ...unsigned } = payload;
  if (
    (await digest(canonical(unsigned))) !== payloadHash ||
    (await digest(canonical(payload.renderedContent))) !== payload.contentHash
  )
    fail("CONTENT_HASH_MISMATCH", 422);
  const expiry = Date.parse(payload.expiresAt);
  const nowMs = Date.now();
  if (expiry < nowMs + 5 * 60 * 1000 || expiry > nowMs + 14 * 24 * 60 * 60 * 1000)
    fail("PREVIEW_EXPIRY_INVALID", 422);
  const token = await previewToken(payload);
  const url = previewUrl(payload.locale, token);
  if (!url) fail("MARKETING_HUB_PUBLIC_ORIGIN_INVALID", 503);
  const tokenHash = await digest(token);
  const db = getDb();
  const old = await db
    .prepare("SELECT * FROM marketing_hub_previews WHERE external_id=?")
    .bind(payload.externalId)
    .first<{
      kind: string;
      locale: string;
      slug: string;
      version_id: string;
      source_revision: number;
      payload_hash: string;
      expires_at: string;
    }>();
  if (
    old &&
    (old.kind !== payload.kind ||
      old.locale !== payload.locale ||
      old.slug !== payload.slug ||
      (old.source_revision === payload.sourceRevision &&
        (old.version_id !== payload.versionId ||
          old.payload_hash !== payload.payloadHash ||
          old.expires_at !== payload.expiresAt)) ||
      old.source_revision > payload.sourceRevision)
  )
    fail("PREVIEW_REVISION_OR_IDENTITY_CONFLICT", 409);
  const result = {
    ok: true,
    status: "ready",
    externalId: payload.externalId,
    taskId: payload.taskId,
    versionId: payload.versionId,
    targetId: payload.targetId,
    sourceRevision: payload.sourceRevision,
    payloadHash: payload.payloadHash,
    contentHash: payload.contentHash,
    previewUrl: url,
    expiresAt: payload.expiresAt,
  };
  if (
    old &&
    old.source_revision === payload.sourceRevision &&
    old.payload_hash === payload.payloadHash
  )
    return json(result);
  const actor = await serviceActor();
  const now = new Date().toISOString();
  const statements = old
    ? [
        guard(
          "EXISTS(SELECT 1 FROM marketing_hub_previews WHERE external_id=? AND source_revision=?)",
          [payload.externalId, old.source_revision],
        ),
        db
          .prepare(
            `UPDATE marketing_hub_previews SET task_id=?,version_id=?,target_id=?,source_revision=?,
              projection_json=?,content_hash=?,payload_hash=?,token_hash=?,expires_at=?,updated_at=?
              WHERE external_id=?`,
          )
          .bind(
            payload.taskId,
            payload.versionId,
            payload.targetId,
            payload.sourceRevision,
            canonical(payload.renderedContent),
            payload.contentHash,
            payload.payloadHash,
            tokenHash,
            payload.expiresAt,
            now,
            payload.externalId,
          ),
      ]
    : [
        db
          .prepare(
            `INSERT INTO marketing_hub_previews
              (external_id,task_id,version_id,target_id,source_revision,kind,locale,slug,
               projection_json,content_hash,payload_hash,token_hash,expires_at,created_at,updated_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .bind(
            payload.externalId,
            payload.taskId,
            payload.versionId,
            payload.targetId,
            payload.sourceRevision,
            payload.kind,
            payload.locale,
            payload.slug,
            canonical(payload.renderedContent),
            payload.contentHash,
            payload.payloadHash,
            tokenHash,
            payload.expiresAt,
            now,
            now,
          ),
      ];
  statements.push(
    db
      .prepare(
        "INSERT INTO audit_log(actor_id,action,entity,entity_id,after_json) VALUES (?,'marketing_hub_preview','marketing_hub_previews',?,?)",
      )
      .bind(actor, payload.externalId, JSON.stringify({ ...result, previewUrl: "[capability]" })),
  );
  try {
    await atomic(statements);
  } catch (error) {
    if (isConflict(error)) fail("PREVIEW_CHANGED", 409);
    throw error;
  }
  return json(result, old ? 200 : 201);
}

export async function readHubPreview(request: Request, token: string): Promise<Response> {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
    "Access-Control-Allow-Origin": request.headers.get("origin") || env.MARKETING_HUB_PUBLIC_ORIGIN || "",
    Vary: "Origin",
  };
  if (!/^[a-f0-9]{64}$/.test(token))
    return new Response(JSON.stringify({ error: "Preview not found" }), { status: 404, headers });
  const row = await getDb()
    .prepare(
      `SELECT external_id,version_id,kind,locale,slug,projection_json,expires_at
       FROM marketing_hub_previews WHERE token_hash=? AND expires_at>?`,
    )
    .bind(await digest(token), new Date().toISOString())
    .first<{
      external_id: string;
      version_id: string;
      kind: "blog";
      locale: string;
      slug: string;
      projection_json: string;
      expires_at: string;
    }>();
  if (!row)
    return new Response(JSON.stringify({ error: "Preview not found" }), { status: 404, headers });
  return new Response(
    JSON.stringify({
      ok: true,
      preview: {
        externalId: row.external_id,
        versionId: row.version_id,
        kind: row.kind,
        locale: row.locale,
        slug: row.slug,
        expiresAt: row.expires_at,
        ...hubPreviewBlogSchema.parse(JSON.parse(row.projection_json)),
      },
    }),
    { status: 200, headers },
  );
}

export async function ingestHubContent(
  raw: string,
  commandId: string,
  requestHash: string,
): Promise<Response> {
  const previous = await replay(commandId, requestHash);
  if (previous) return previous;
  const payload = hubEnvelopeSchema.parse(JSON.parse(raw));
  if (!payload.externalId.startsWith(`crm:${payload.taskId}:`)) fail("EXTERNAL_ID_MISMATCH", 422);
  const { payloadHash, ...unsigned } = payload;
  if (
    (await digest(canonical(unsigned))) !== payloadHash ||
    (await digest(canonical(payload.content))) !== payload.contentHash
  )
    fail("CONTENT_HASH_MISMATCH", 422);
  const projection =
    payload.kind === "event"
      ? hubEventSchema.parse(payload.renderedContent)
      : hubBlogSchema.parse(payload.renderedContent);
  const old = await getHubContent(payload.externalId);
  if (
    old &&
    (old.kind !== payload.kind ||
      old.slug !== payload.slug ||
      old.locale !== payload.locale ||
      payload.sourceRevision <= old.source_revision)
  )
    fail("SOURCE_REVISION_OR_IDENTITY_CONFLICT", 409);
  const table = contentTable(payload.kind);
  const db = getDb();
  const actor = await serviceActor();
  const now = new Date().toISOString();
  const revision = old ? old.cms_revision + 1 : 1;
  const acknowledgement = {
    ok: true,
    status: "draft",
    externalId: payload.externalId,
    taskId: payload.taskId,
    versionId: payload.versionId,
    approvalId: payload.approvalId,
    sourceRevision: payload.sourceRevision,
    payloadHash,
    contentHash: payload.contentHash,
    cmsRevision: revision,
    slug: payload.slug,
    locale: payload.locale,
  };
  // Column names originate ONLY from strict kind-specific schemas, never arbitrary JSON keys.
  const columns = Object.keys(projection);
  const values = Object.values(projection);
  const statements = old
    ? [
        guard(
          `EXISTS(SELECT 1 FROM marketing_hub_contents m JOIN ${table} c ON c.id=m.content_id
      WHERE m.external_id=? AND m.cms_revision=? AND m.source_revision=? AND c.status='draft')`,
          [old.external_id, old.cms_revision, old.source_revision],
        ),
        db
          .prepare(
            `UPDATE ${table} SET ${columns.map((column) => `${column}=?`).join(",")},updated_by=?,updated_at=unixepoch() WHERE id=?`,
          )
          .bind(...values, actor, old.content_id),
        db
          .prepare(
            `UPDATE marketing_hub_contents SET source_revision=?,cms_revision=?,payload_json=?,payload_hash=?,projection_json=?,updated_at=? WHERE external_id=?`,
          )
          .bind(
            payload.sourceRevision,
            revision,
            raw,
            payloadHash,
            canonical(projection),
            now,
            payload.externalId,
          ),
      ]
    : [
        guard(
          `NOT EXISTS(SELECT 1 FROM marketing_hub_contents WHERE external_id=?) AND NOT EXISTS(SELECT 1 FROM ${table} WHERE slug=? AND locale=?)`,
          [payload.externalId, payload.slug, payload.locale],
        ),
        db
          .prepare(
            `INSERT INTO ${table}(slug,locale,${columns.join(",")},status,updated_by,updated_at${payload.kind === "blog" ? ",author_id" : ""})
      VALUES (?, ?, ${columns.map(() => "?").join(",")},'draft',?,unixepoch()${payload.kind === "blog" ? ",?" : ""})`,
          )
          .bind(
            payload.slug,
            payload.locale,
            ...values,
            actor,
            ...(payload.kind === "blog" ? [actor] : []),
          ),
        db
          .prepare(
            `INSERT INTO marketing_hub_contents(external_id,kind,slug,locale,content_id,source_revision,cms_revision,payload_json,payload_hash,projection_json,created_at,updated_at)
      SELECT ?,?,?,?,id,?,1,?,?,?,?,? FROM ${table} WHERE slug=? AND locale=?`,
          )
          .bind(
            payload.externalId,
            payload.kind,
            payload.slug,
            payload.locale,
            payload.sourceRevision,
            raw,
            payloadHash,
            canonical(projection),
            now,
            now,
            payload.slug,
            payload.locale,
          ),
      ];
  statements.push(
    db
      .prepare(
        "INSERT INTO audit_log(actor_id,action,entity,entity_id,after_json) VALUES (?,'marketing_hub_draft','marketing_hub_contents',?,?)",
      )
      .bind(actor, payload.externalId, JSON.stringify(acknowledgement)),
    saveCommand(commandId, requestHash, acknowledgement, old ? 200 : 201),
  );
  try {
    await atomic(statements);
  } catch (error) {
    const won = await replay(commandId, requestHash);
    if (won) return won;
    if (isConflict(error)) fail("CMS_CONTENT_CHANGED_OR_SLUG_OWNED", 409);
    throw error;
  }
  return json(acknowledgement, old ? 200 : 201);
}

export async function readHubContent(externalId: string): Promise<Response> {
  const mapping = await getHubContent(externalId);
  if (!mapping) fail("CONTENT_NOT_FOUND", 404);
  const content = await getDb()
    .prepare(`SELECT status FROM ${contentTable(mapping.kind)} WHERE id=?`)
    .bind(mapping.content_id)
    .first<{ status: string }>();
  const source = hubEnvelopeSchema.parse(JSON.parse(mapping.payload_json));
  const callbacks = await getDb()
    .prepare(
      `SELECT event_id AS eventId,state,attempts,error_code AS errorCode
    FROM marketing_hub_outbox WHERE external_id=? ORDER BY created_at DESC,event_id DESC LIMIT 20`,
    )
    .bind(externalId)
    .all();
  return json(
    hubReadResponseSchema.parse({
      externalId,
      taskId: source.taskId,
      versionId: source.versionId,
      approvalId: source.approvalId,
      sourceRevision: mapping.source_revision,
      payloadHash: mapping.payload_hash,
      contentHash: source.contentHash,
      kind: mapping.kind,
      locale: mapping.locale,
      slug: mapping.slug,
      cmsRevision: mapping.cms_revision,
      status: content?.status || "missing",
      publicUrl:
        content?.status === "live" ? publicUrl(mapping.kind, mapping.locale, mapping.slug) : null,
      callbacks: callbacks.results || [],
    }),
  );
}

export async function ingestHubMedia(
  raw: string,
  commandId: string,
  requestHash: string,
): Promise<Response> {
  const previous = await replay(commandId, requestHash);
  if (previous) return previous;
  const payload = hubMediaSchema.parse(JSON.parse(raw));
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload.dataBase64))
    fail("INVALID_BASE64", 422);
  const bytes = Uint8Array.from(atob(payload.dataBase64), (char) => char.charCodeAt(0));
  if (!bytes.length || bytes.length > 1024 * 1024) fail("IMAGE_SIZE_LIMIT", 413);
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp =
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  if (!(payload.mime === "image/png" ? png : payload.mime === "image/jpeg" ? jpeg : webp))
    fail("IMAGE_SIGNATURE_MISMATCH", 422);
  const contentHash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const key = `marketing/${contentHash}.${payload.mime === "image/png" ? "png" : payload.mime === "image/jpeg" ? "jpg" : "webp"}`;
  const actor = await serviceActor();
  const result = {
    ok: true,
    key,
    mime: payload.mime,
    bytes: bytes.length,
    contentHash,
    path: `/api/v1/media/${key}`,
  };
  // Content-addressed immutable object: a retry safely reuses it. Never delete
  // on DB conflict, which could erase the winner's referenced object.
  await env.MEDIA.put(key, bytes, {
    httpMetadata: { contentType: payload.mime, cacheControl: "public,max-age=31536000,immutable" },
  });
  try {
    await atomic([
      getDb()
        .prepare(
          "INSERT INTO media(r2_key,mime,bytes,alt_text,status,uploaded_by) VALUES (?,?,?,?,'ready',?) ON CONFLICT(r2_key) DO NOTHING",
        )
        .bind(key, payload.mime, bytes.length, payload.altText, actor),
      getDb()
        .prepare(
          "INSERT INTO audit_log(actor_id,action,entity,entity_id,after_json) VALUES (?,'marketing_hub_media','media',?,?)",
        )
        .bind(actor, key, JSON.stringify(result)),
      saveCommand(commandId, requestHash, result, 201),
    ]);
  } catch (error) {
    const won = await replay(commandId, requestHash);
    if (won) return won;
    throw error;
  }
  return json(result, 201);
}

export async function retryHubCallback(
  eventId: string,
  raw: string,
  commandId: string,
  requestHash: string,
): Promise<Response> {
  const previous = await replay(commandId, requestHash);
  if (previous) return previous;
  const { expectedAttempts } = hubRetrySchema.parse(JSON.parse(raw));
  const row = await getDb()
    .prepare(
      "SELECT external_id,cms_revision,state,attempts FROM marketing_hub_outbox WHERE event_id=?",
    )
    .bind(eventId)
    .first<{ external_id: string; cms_revision: number; state: string; attempts: number }>();
  if (!row) fail("CALLBACK_NOT_FOUND", 404);
  const actor = await serviceActor();
  const result = { ok: true, eventId, state: "pending", attempts: 0 };
  try {
    await atomic([
      guard(
        `EXISTS(SELECT 1 FROM marketing_hub_outbox o JOIN marketing_hub_contents c ON c.external_id=o.external_id
        WHERE o.event_id=? AND o.attempts=? AND o.state IN ('blocked','retry_wait') AND o.cms_revision=c.cms_revision)`,
        [eventId, expectedAttempts],
      ),
      getDb()
        .prepare(
          "UPDATE marketing_hub_outbox SET state='pending',attempts=0,error_code=NULL,lease_token=NULL,lease_until=NULL,next_attempt_at=?,updated_at=? WHERE event_id=?",
        )
        .bind(new Date().toISOString(), new Date().toISOString(), eventId),
      getDb()
        .prepare(
          "INSERT INTO audit_log(actor_id,action,entity,entity_id,before_json,after_json) VALUES (?,'marketing_hub_callback_retry','marketing_hub_outbox',?,?,?)",
        )
        .bind(actor, eventId, JSON.stringify(row), JSON.stringify(result)),
      saveCommand(commandId, requestHash, result, 202),
    ]);
  } catch (error) {
    const won = await replay(commandId, requestHash);
    if (won) return won;
    if (isConflict(error)) fail("CALLBACK_CHANGED_OR_NOT_RETRYABLE", 409);
    throw error;
  }
  return json(result, 202);
}
