import { beforeEach, afterEach, expect, mock, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { canonical, digest, hmac } from "./marketing-hub.crypto";
import { hubReadResponseSchema } from "./marketing-hub.schemas";

const runtime = {} as Cloudflare.Env;
mock.module("cloudflare:workers", () => ({ env: runtime }));
const { handleHubRequest } = await import("./marketing-hub.http");
const { flushMarketingHubOutbox } = await import("./marketing-hub.outbox");
let sql: Database;
const originalFetch = globalThis.fetch;

function d1(database: Database): D1Database {
  const db = {
    prepare(query: string) {
      let args: (string | number | null)[] = [];
      const prepared = {
        bind(...values: (string | number | null)[]) {
          args = values;
          return prepared;
        },
        async first() {
          return database.query(query).get(...args);
        },
        async all() {
          return { results: database.query(query).all(...args) };
        },
        async run() {
          return prepared.execute();
        },
        execute() {
          return { success: true, meta: { changes: database.query(query).run(...args).changes } };
        },
      };
      return prepared;
    },
    async batch(statements: { execute(): unknown }[]) {
      database.exec("BEGIN");
      try {
        const results = statements.map((statement) => statement.execute());
        database.exec("COMMIT");
        return results;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return db as unknown as D1Database;
}
beforeEach(() => {
  sql = new Database(":memory:");
  const directory = new URL("../../../db/migrations/", import.meta.url);
  for (const file of readdirSync(directory)
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    sql.exec(readFileSync(new URL(file, directory), "utf8"));
  }
  sql.exec(
    "INSERT INTO users(id,email,name,role,status,provider) VALUES(9001,'admin@example.test','Editor','admin','active','local')",
  );
  Object.assign(runtime, {
    DB: d1(sql),
    MARKETING_HUB_INGEST_ENABLED: "true",
    MARKETING_HUB_CALLBACKS_ENABLED: "true",
    MARKETING_HUB_SIGNING_SECRET: "test-only-not-a-deployed-secret",
    MARKETING_HUB_PUBLIC_ORIGIN: "https://landing.example.test",
    MARKETING_HUB_CALLBACK_URL: "https://crm.example.test/api/marketing/integrations/cms/events",
    RATE_LIMITER: {
      idFromName: (name: string) => name,
      get: () => ({ hit: async () => ({ allowed: true }) }),
    },
    MEDIA: { put: async () => ({}) },
  });
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  sql?.close();
});

async function envelope(kind: "blog" | "event" = "blog", revision = 1) {
  const content = { text: "# Approved article" };
  const renderedContent =
    kind === "blog"
      ? {
          title: "Title",
          body_md: content.text,
          excerpt: null,
          category: null,
          published_date: null,
          seo_title: null,
          seo_description: null,
        }
      : {
          title: "Title",
          body_md: content.text,
          summary: null,
          event_date: "2026-12-30",
          end_date: null,
          location: null,
          role: null,
          url: null,
          video_url: null,
          seo_title: null,
          seo_description: null,
        };
  const body = {
    schemaVersion: 1,
    externalId: `crm:task:${kind}`,
    taskId: "task",
    versionId: `version-${revision}`,
    approvalId: `approval-${revision}`,
    sourceRevision: revision,
    kind,
    locale: "vi",
    slug: `marketing-${kind}`,
    content,
    sourceLinks: [],
    contentHash: await digest(canonical(content)),
    renderedContent,
  };
  return { ...body, payloadHash: await digest(canonical(body)) };
}
async function request(
  body: unknown,
  id = crypto.randomUUID(),
  path = "/api/v1/agent/contents",
  method = "POST",
) {
  const raw = body === undefined ? "" : JSON.stringify(body);
  const timestamp = new Date().toISOString();
  return new Request(`https://cms.example.test${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-thg-contract": "marketing-hub-content.v1",
      "x-thg-event-id": id,
      "x-thg-timestamp": timestamp,
      "x-thg-signature": `v1=${await hmac(runtime.MARKETING_HUB_SIGNING_SECRET!, `${timestamp}\n${id}\n${raw}`)}`,
    },
    ...(method === "GET" ? {} : { body: raw }),
  });
}
async function ingest(body: unknown, id = crypto.randomUUID()) {
  return handleHubRequest(await request(body, id), "content");
}

test("real migrations plus signed Blog and Event ingest remain draft-only and idempotent", async () => {
  for (const kind of ["blog", "event"] as const) {
    const body = await envelope(kind);
    const key = crypto.randomUUID();
    const first = await ingest(body, key);
    expect(first.status).toBe(201);
    const ack = (await first.json()) as { status: string; cmsRevision: number };
    expect(ack.status).toBe("draft");
    expect(ack.cmsRevision).toBe(1);
    const replay = await ingest(body, key);
    expect(replay.status).toBe(201);
    expect((await replay.json()) as typeof ack).toEqual(ack);
    const changed = await envelope(kind, 2);
    expect((await ingest(changed, key)).status).toBe(409);
    expect((await ingest(changed)).status).toBe(200);
    const table = kind === "blog" ? "blog_posts" : "events";
    expect(sql.query(`SELECT status FROM ${table} WHERE slug=?`).get(body.slug)).toEqual({
      status: "draft",
    });
    sql.query(`UPDATE ${table} SET status='live',updated_by=9001 WHERE slug=?`).run(body.slug);
    expect((await ingest(await envelope(kind, 3))).status).toBe(409);
    expect((await ingest(body, key)).status).toBe(201);
  }
  expect(sql.query("SELECT COUNT(*) n FROM marketing_hub_outbox").get()).toEqual({ n: 2 });
});

test("tampered HMAC/hash/schema and a manually owned slug never create Hub content", async () => {
  const body = await envelope();
  const invalid = await request(body);
  invalid.headers.set("x-thg-signature", `v1=${"0".repeat(64)}`);
  expect((await handleHubRequest(invalid, "content")).status).toBe(401);
  expect((await ingest({ ...body, contentHash: "0".repeat(64) })).status).toBe(422);
  expect((await ingest({ ...body, status: "live" })).status).toBe(422);
  sql.exec(
    "INSERT INTO blog_posts(slug,locale,title,status) VALUES('marketing-blog','vi','Manual','draft')",
  );
  expect((await ingest(body)).status).toBe(409);
  expect(sql.query("SELECT COUNT(*) n FROM marketing_hub_contents").get()).toEqual({ n: 0 });
  expect(sql.query("SELECT COUNT(*) n FROM marketing_hub_commands").get()).toEqual({ n: 0 });
});

test("publish trigger durably captures provenance and dispatcher sends a signed stable callback once", async () => {
  const body = await envelope();
  expect((await ingest(body)).status).toBe(201);
  sql.exec("UPDATE blog_posts SET status='live',updated_by=9001 WHERE slug='marketing-blog'");
  let sent = 0;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    sent++;
    const headers = new Headers(init?.headers);
    const raw = String(init?.body);
    expect(headers.get("x-thg-signature")).toBe(
      `v1=${await hmac(runtime.MARKETING_HUB_SIGNING_SECRET!, `${headers.get("x-thg-timestamp")}\n${headers.get("x-thg-event-id")}\n${raw}`)}`,
    );
    const event = JSON.parse(raw);
    expect(event.data.payloadHash).toBe(body.payloadHash);
    expect(event.data.publisher).toBe("9001");
    return Response.json({ ok: true, taskId: body.taskId });
  }) as typeof fetch;
  await flushMarketingHubOutbox();
  await flushMarketingHubOutbox();
  expect(sent).toBe(1);
  const response = await handleHubRequest(
    await request(
      undefined,
      crypto.randomUUID(),
      `/api/v1/agent/contents/${body.externalId}`,
      "GET",
    ),
    "read",
    body.externalId,
  );
  expect(response.status).toBe(200);
  const status = hubReadResponseSchema.parse(await response.json());
  expect(status.status).toBe("live");
  expect(status.callbacks[0].state).toBe("succeeded");
  const eventId = status.callbacks[0].eventId;
  expect(
    (await handleHubRequest(await request({ expectedAttempts: 1 }), "retry", eventId)).status,
  ).toBe(409);
});

test("edited approved content blocks callback; failed callback retries same body", async () => {
  const body = await envelope();
  await ingest(body);
  sql.exec(
    "UPDATE blog_posts SET status='live',updated_by=9001,body_md='Changed' WHERE slug='marketing-blog'",
  );
  globalThis.fetch = (async () => {
    throw new Error("Must not send changed approved content");
  }) as unknown as typeof fetch;
  await flushMarketingHubOutbox();
  expect(sql.query("SELECT state,error_code FROM marketing_hub_outbox").get()).toEqual({
    state: "blocked",
    error_code: "APPROVED_CONTENT_CHANGED",
  });
  sql
    .query("UPDATE blog_posts SET body_md=? WHERE slug='marketing-blog'")
    .run(body.renderedContent.body_md);
  const sent: string[] = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    sent.push(String(init?.body));
    return sent.length === 1
      ? new Response("", { status: 503 })
      : Response.json({ ok: true, taskId: body.taskId });
  }) as typeof fetch;
  await flushMarketingHubOutbox();
  sql.exec(
    "UPDATE marketing_hub_outbox SET next_attempt_at='2000-01-01T00:00:00.000Z' WHERE state='retry_wait'",
  );
  await flushMarketingHubOutbox();
  expect(sent.length).toBe(2);
  expect(sent[1]).toBe(sent[0]);
});

test("media ingest is bounded, content-addressed and idempotent", async () => {
  const id = crypto.randomUUID();
  const image = {
    mime: "image/png",
    dataBase64:
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6l8AAAAASUVORK5CYII=",
    altText: "Test",
  };
  const send = async (body: unknown, key = id) =>
    handleHubRequest(await request(body, key, "/api/v1/agent/media"), "media");
  const first = await send(image);
  expect(first.status).toBe(201);
  const saved = (await first.json()) as { key: string };
  expect(saved.key.startsWith("marketing/")).toBe(true);
  expect((await (await send(image)).json()) as typeof saved).toEqual(saved);
  expect((await send({ ...image, mime: "image/jpeg" }, crypto.randomUUID())).status).toBe(422);
  expect((await send({ ...image, dataBase64: "!!!!" }, crypto.randomUUID())).status).toBe(422);
});
