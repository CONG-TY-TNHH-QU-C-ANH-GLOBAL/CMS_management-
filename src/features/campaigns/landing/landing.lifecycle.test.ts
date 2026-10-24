// Landing version lifecycle through the PRODUCTION entry points marketing actually calls —
// the multipart upload route and the server functions in landing.actions.ts — with the real
// auth service (session cookie → sessions table → role), the real CSRF Origin check, the real
// audit_log writes, the real Telegram dispatcher + outbox (its UNIQUE idempotency index is the
// "one message per version" guarantee) and real SQLite with the full migration chain.
// Only Worker boundaries are stubbed (see __fixtures__/worker-harness.ts).
//
// Oracle: the owner's rules — viewers read, editors do everything, anonymous 401, a foreign
// Origin 403 on every mutation with no side effect; critical findings need "Vẫn xuất bản";
// IT gets exactly one report per version; content is never changed by a failed AI step.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { makeZip } from "./__fixtures__/make-zip";
import {
  createLoader,
  d1,
  fileRouteStub,
  memoryR2,
  migrationFiles,
  serverFnStub,
  srcPath,
} from "./__fixtures__/worker-harness";
import { createLandingAi } from "./landing.ai";
import { normalizeLandingHtml } from "./landing.normalize";

const CMS = "https://cms.thgfulfill.com";
const LP = "https://lp.thgfulfill.com";
const SAMPLE = readFileSync(join(import.meta.dir, "__fixtures__", "xmas-index.html"), "utf8");
const USERS = { viewer: 11, editor: 12, admin: 13 } as const;
type Who = keyof typeof USERS | "anonymous";

// ── Database: migrations up to 0062, then two Telegram channels, then 0063+ ──
// so the test also proves 0063 subscribes EXISTING infra channels to landing_review.
let snapshot: Uint8Array;
let sql: Database;
let r2 = memoryR2();
let revPuts: string[] = [];
let current: Request = new Request(CMS);

const env: Record<string, unknown> = {
  DB: d1(() => sql),
  BASE_URL: CMS,
  LANDING_HOST: "lp.thgfulfill.com",
  LANDING_ORIGIN: LP,
  // Never set: landingDeps() must not build a networked Claude client in this file.
  ANTHROPIC_API_KEY: undefined,
  CMS_REV: { put: async (_k: string, v: string) => void revPuts.push(v) },
};

const loader = createLoader({
  "cloudflare:workers": { env, DurableObject: class {} },
  "@tanstack/react-start/server": {
    getRequest: () => current,
    setResponseHeader: () => {},
  },
  "@tanstack/react-start": serverFnStub,
  "@tanstack/react-router": fileRouteStub,
  "@/features/careers/landing-rebuild": { markLandingRebuildNeeded: async () => {} },
  [srcPath("features/telegram/telegram.outbox")]: { flushTelegramOutbox: async () => 0 },
});

type Fn = (data: unknown) => Promise<unknown>;
const actions = loader.load<Record<string, Fn>>(
  srcPath("features/campaigns/landing/landing.actions"),
);
const uploadRoute = loader.load<{
  Route: {
    options: { server: { handlers: { POST: (ctx: { request: Request }) => Promise<Response> } } };
  };
}>(srcPath("routes/api/v1/(admin)/landing-uploads/index"));
const server = loader.load<typeof import("./landing.server")>(
  srcPath("features/campaigns/landing/landing.server"),
);
const service = loader.load<typeof import("./landing.service")>(
  srcPath("features/campaigns/landing/landing.service"),
);
const campaigns = loader.load<typeof import("../campaigns.service")>(
  srcPath("features/campaigns/campaigns.service"),
);
const host = loader.load<typeof import("./landing.host")>(
  srcPath("features/campaigns/landing/landing.host"),
);
const hostDeps = loader.load<typeof import("./landing.host.server")>(
  srcPath("features/campaigns/landing/landing.host.server"),
);

const realFetch = globalThis.fetch;
beforeAll(() => {
  // Belt and braces: nothing in this file may reach the network (Claude, Telegram).
  globalThis.fetch = (() => {
    throw new Error("network call in landing lifecycle test");
  }) as unknown as typeof fetch;
  const fresh = new Database(":memory:");
  const files = migrationFiles();
  const at = files.findIndex((f) => f.endsWith("0063_campaign_landings.sql"));
  for (const file of files.slice(0, at)) fresh.exec(readFileSync(file, "utf8"));
  fresh.exec(
    `INSERT INTO telegram_channels (id, label, chat_id, kind) VALUES (1, 'IT', '-100', 'infra'), (2, 'Sales', '-200', 'ops');`,
  );
  for (const file of files.slice(at)) fresh.exec(readFileSync(file, "utf8"));
  for (const [role, id] of Object.entries(USERS)) {
    fresh.exec(
      `INSERT INTO users (id, email, name, role, status, password_hash) VALUES (${id}, '${role}@thg.test', '${role}', '${role}', 'active', 'x');
       INSERT INTO sessions (id, user_id, expires_at) VALUES ('sid-${role}', ${id}, unixepoch() + 86400);`,
    );
  }
  snapshot = fresh.serialize();
  fresh.close();
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

let campaignId: number;
beforeEach(() => {
  sql = Database.deserialize(snapshot);
  r2 = memoryR2();
  env.MEDIA = r2.bucket;
  revPuts = [];
  campaignId = (
    sql.query(`SELECT id FROM campaigns WHERE slug = 'christmas-2026'`).get() as { id: number }
  ).id;
});

// ── Acting as someone ────────────────────────────────────────────────────────
function requestAs(who: Who, init: { origin?: string | null; body?: BodyInit; url?: string } = {}) {
  const headers = new Headers();
  if (who !== "anonymous") headers.set("cookie", `other=1; thg_sid=sid-${who}`);
  const origin = init.origin === undefined ? CMS : init.origin;
  if (origin !== null) headers.set("origin", origin);
  return new Request(init.url ?? `${CMS}/_serverFn/landing`, {
    method: "POST",
    headers,
    body: init.body,
  });
}
async function call(who: Who, fn: string, data: unknown, origin?: string | null) {
  current = requestAs(who, { origin });
  if (fn === "listLandingVersionsFn")
    current = new Request(current.url, { headers: current.headers });
  try {
    return { ok: true as const, value: (await actions[fn](data)) as Record<string, unknown> };
  } catch (error) {
    const e = error as { statusCode?: number; code?: string; message: string };
    return { ok: false as const, status: e.statusCode, code: e.code, message: e.message };
  }
}
async function upload(
  who: Who,
  zip: Uint8Array,
  opts: { origin?: string | null; campaign?: number } = {},
) {
  const form = new FormData();
  form.set("campaign_id", String(opts.campaign ?? campaignId));
  form.set("file", new File([zip as BlobPart], "landing.zip", { type: "application/zip" }));
  current = requestAs(who, {
    origin: opts.origin,
    body: form,
    url: `${CMS}/api/v1/landing-uploads`,
  });
  try {
    const res = await uploadRoute.Route.options.server.handlers.POST({ request: current });
    return {
      status: res.status,
      body: (await res.json()) as { version?: { id: string }; error?: string },
    };
  } catch (error) {
    const e = error as { statusCode?: number; code?: string };
    return { status: e.statusCode ?? 500, body: { error: e.code } };
  }
}

const sampleZip = () => makeZip([{ name: "index.html", data: SAMPLE }]);
const count = (table: string, where = "1") =>
  (sql.query(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get() as { n: number }).n;
const campaignRow = () =>
  sql
    .query(`SELECT landing_path, landing_version_id FROM campaigns WHERE id = ?`)
    .get(campaignId) as {
    landing_path: string | null;
    landing_version_id: string | null;
  };
const outbox = () =>
  sql
    .query(`SELECT event_type, channel_id, idempotency_key, body_text FROM telegram_outbox`)
    .all() as {
    event_type: string;
    channel_id: number;
    idempotency_key: string;
    body_text: string;
  }[];
const lpGet = (path: string) =>
  host.handleLandingRequest(
    new Request(`${LP}${path}`),
    hostDeps.landingHostDeps({ DB: env.DB as D1Database, MEDIA: r2.bucket, BASE_URL: CMS }),
  );

/** Everything a mutation could have touched, for "nothing changed" assertions. */
const sideEffects = () => ({
  versions: count("campaign_landing_versions"),
  published: count("campaign_landing_versions", "last_published_at IS NOT NULL"),
  audit: count("audit_log"),
  outbox: count("telegram_outbox"),
  campaign: campaignRow(),
  r2: r2.store.size,
  rev: revPuts.length,
});

async function readyVersion(): Promise<string> {
  const up = await upload("editor", sampleZip());
  expect(up.status).toBe(201);
  const id = up.body.version!.id;
  const processed = await call("editor", "processLandingVersionFn", { version_id: id });
  expect(processed).toMatchObject({ ok: true, value: { status: "ready" } });
  return id;
}

describe("roles and origin on every landing entry point", () => {
  test("anonymous gets 401 everywhere and changes nothing", async () => {
    const id = await readyVersion();
    const before = sideEffects();
    expect((await upload("anonymous", sampleZip())).status).toBe(401);
    for (const [fn, data] of [
      ["listLandingVersionsFn", { campaign_id: campaignId }],
      ["processLandingVersionFn", { version_id: id }],
      ["publishLandingVersionFn", { version_id: id, confirm_critical: true }],
      ["rollbackLandingFn", { campaign_id: campaignId }],
    ] as const) {
      expect(await call("anonymous", fn, data)).toMatchObject({ ok: false, status: 401 });
    }
    expect(sideEffects()).toEqual(before);
  });

  test("a viewer can read versions but every mutation is 403 with no side effect", async () => {
    const id = await readyVersion();
    const listed = await call("viewer", "listLandingVersionsFn", { campaign_id: campaignId });
    expect(listed.ok && (listed.value.versions as unknown[]).length).toBe(1);
    const before = sideEffects();
    expect((await upload("viewer", sampleZip())).status).toBe(403);
    for (const [fn, data] of [
      ["processLandingVersionFn", { version_id: id }],
      ["publishLandingVersionFn", { version_id: id, confirm_critical: true }],
      ["rollbackLandingFn", { campaign_id: campaignId }],
    ] as const) {
      expect(await call("viewer", fn, data)).toMatchObject({
        ok: false,
        status: 403,
        code: "FORBIDDEN",
      });
    }
    expect(sideEffects()).toEqual(before);
  });

  test("an editor's cookie from a foreign Origin — including lp itself — is refused before anything runs", async () => {
    const id = await readyVersion();
    const before = sideEffects();
    // lp.thgfulfill.com is SAME-SITE with cms, so SameSite=Lax still sends the session cookie
    // from an uploaded page's script: the Origin check is the boundary that must hold here.
    for (const origin of [
      LP,
      "https://evil.example",
      "https://cms.thgfulfill.com.evil.example",
      "null",
      null,
    ]) {
      const up = await upload("editor", sampleZip(), { origin });
      expect({ origin, status: up.status }).toEqual({ origin, status: 403 });
      for (const [fn, data] of [
        ["processLandingVersionFn", { version_id: id }],
        ["publishLandingVersionFn", { version_id: id, confirm_critical: true }],
        ["rollbackLandingFn", { campaign_id: campaignId }],
      ] as const) {
        const result = await call("editor", fn, data, origin);
        expect({ origin, fn, status: result.ok ? 200 : result.status }).toEqual({
          origin,
          fn,
          status: 403,
        });
      }
    }
    expect(sideEffects()).toEqual(before);
  });

  test("validators reject malformed ids before any session or database work", async () => {
    for (const data of [
      { version_id: "../x" },
      { version_id: "A".repeat(32) },
      { version_id: 1 },
      {},
    ]) {
      const result = await call("editor", "publishLandingVersionFn", data);
      expect(result.ok).toBe(false);
      expect(result.ok || result.status).toBeUndefined(); // a zod error, not an HTTP-coded one
    }
  });
});

describe("upload → process → publish → rollback", () => {
  test("upload stores an unguessable version and the editor can preview it before publishing", async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) ids.add(server.landingDeps().newVersionId());
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^[a-f0-9]{32}$/);

    const up = await upload("editor", sampleZip());
    const id = up.body.version!.id;
    expect(up).toMatchObject({ status: 201, body: { version: { status: "processing" } } });
    expect((await lpGet(`/_preview/${id}/`)).status).toBe(200);
    expect((await lpGet("/christmas-2026/")).status).toBe(404);
    expect(sql.query(`SELECT action, entity FROM audit_log`).all()).toEqual([
      { action: "create", entity: "campaign_landing_versions" },
    ]);
  });

  test("upload to an unknown campaign is 404 and a bad zip is 400, both storing nothing", async () => {
    const before = sideEffects();
    expect(await upload("editor", sampleZip(), { campaign: 999_999 })).toMatchObject({
      status: 404,
    });
    const bad = await upload(
      "editor",
      makeZip([
        { name: "index.html", data: "x" },
        { name: "../x.js", data: "" },
      ]),
    );
    expect(bad.status).toBe(400);
    expect(bad.body.error).toContain("..");
    expect(sideEffects()).toEqual(before);
  });

  test("IT gets exactly one Telegram report per version, on infra channels only, even when re-processed", async () => {
    const subs = sql
      .query(`SELECT channel_id FROM telegram_subscriptions WHERE event_type = 'landing_review'`)
      .all();
    expect(subs).toEqual([{ channel_id: 1 }]);
    const id = await readyVersion();
    expect(await call("editor", "processLandingVersionFn", { version_id: id })).toMatchObject({
      ok: true,
    });
    expect(await call("editor", "processLandingVersionFn", { version_id: id })).toMatchObject({
      ok: true,
    });
    const rows = outbox();
    expect(rows.map((r) => [r.event_type, r.channel_id, r.idempotency_key])).toEqual([
      ["landing_review", 1, `landing_review:${id}:1`],
    ]);
    expect(rows[0].body_text).toContain(`${LP}/_preview/${id}/`);
    const second = await readyVersion();
    expect(outbox().map((r) => r.idempotency_key)).toEqual([
      `landing_review:${id}:1`,
      `landing_review:${second}:1`,
    ]);
  });

  test("critical findings: publish without the confirm is refused and changes nothing", async () => {
    const id = await readyVersion();
    expect(
      sql.query(`SELECT critical_count FROM campaign_landing_versions WHERE id = ?`).get(id),
    ).toEqual({
      critical_count: 1,
    });
    const before = sideEffects();
    for (const data of [{ version_id: id }, { version_id: id, confirm_critical: false }]) {
      const refused = await call("editor", "publishLandingVersionFn", data);
      expect(refused).toMatchObject({ ok: false, status: 409 });
      expect(refused.ok || refused.message).toContain("Vẫn xuất bản");
    }
    expect(sideEffects()).toEqual(before);
    expect((await lpGet("/christmas-2026/")).status).toBe(404);
  });

  test("publish, publish another, roll back, and refuse to roll back past the first", async () => {
    expect(await call("editor", "rollbackLandingFn", { campaign_id: campaignId })).toMatchObject({
      ok: false,
      status: 409,
    });
    const v1 = await readyVersion();
    const v2 = await readyVersion();
    const p1 = await call("editor", "publishLandingVersionFn", {
      version_id: v1,
      confirm_critical: true,
    });
    expect(p1).toMatchObject({ ok: true, value: { landing_path: `${LP}/christmas-2026/` } });
    expect(campaignRow()).toEqual({
      landing_path: `${LP}/christmas-2026/`,
      landing_version_id: v1,
    });
    expect(revPuts).toHaveLength(1);
    const audit = sql
      .query(
        `SELECT actor_id, action, entity, before_json, after_json FROM audit_log WHERE entity = 'campaigns'`,
      )
      .all() as {
      actor_id: number;
      action: string;
      before_json: string;
      after_json: string;
    }[];
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor_id: USERS.editor, action: "publish" });
    expect(JSON.parse(audit[0].before_json)).toEqual({
      landing_version_id: null,
      landing_path: "/christmas",
    });
    expect(JSON.parse(audit[0].after_json)).toEqual({
      landing_version_id: v1,
      landing_path: `${LP}/christmas-2026/`,
    });

    await call("editor", "publishLandingVersionFn", { version_id: v2, confirm_critical: true });
    expect(campaignRow().landing_version_id).toBe(v2);
    const back = await call("editor", "rollbackLandingFn", { campaign_id: campaignId });
    expect(back).toMatchObject({ ok: true, value: { version_id: v1 } });
    expect(campaignRow()).toEqual({
      landing_path: `${LP}/christmas-2026/`,
      landing_version_id: v1,
    });
    expect(revPuts).toHaveLength(3);
    const before = sideEffects();
    expect(await call("editor", "rollbackLandingFn", { campaign_id: campaignId })).toMatchObject({
      ok: false,
      status: 409,
    });
    expect(sideEffects()).toEqual(before);
    expect(
      sql.query(`SELECT action FROM audit_log WHERE entity = 'campaigns' ORDER BY id`).all(),
    ).toEqual([{ action: "publish" }, { action: "publish" }, { action: "rollback" }]);
  });

  test("two concurrent publishes leave one consistent live pointer", async () => {
    const v1 = await readyVersion();
    const v2 = await readyVersion();
    const results = await Promise.all([
      call("editor", "publishLandingVersionFn", { version_id: v1, confirm_critical: true }),
      call("editor", "publishLandingVersionFn", { version_id: v2, confirm_critical: true }),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    const live = campaignRow();
    expect([v1, v2]).toContain(live.landing_version_id ?? "none");
    expect(live.landing_path).toBe(`${LP}/christmas-2026/`);
    const page = await lpGet("/christmas-2026/");
    expect(page.status).toBe(200);
    // What lp serves is the pointer's version, byte for byte.
    const served = await page.text();
    expect(served).toBe(
      new TextDecoder().decode(
        r2.store.get(`landings/christmas-2026/${live.landing_version_id}/site/index.html`),
      ),
    );
    // Rolling back from the winner reaches the loser.
    const back = await call("editor", "rollbackLandingFn", { campaign_id: campaignId });
    expect(back.ok && back.value.version_id).toBe(live.landing_version_id === v1 ? v2 : v1);
  });

  test("a failed version cannot be processed again or previewed, and is never published", async () => {
    const up = await upload("editor", sampleZip());
    const id = up.body.version!.id;
    sql.query(`UPDATE campaign_landing_versions SET status = 'failed' WHERE id = ?`).run(id);
    expect(await call("editor", "processLandingVersionFn", { version_id: id })).toMatchObject({
      ok: false,
      status: 409,
    });
    expect(
      await call("editor", "publishLandingVersionFn", { version_id: id, confirm_critical: true }),
    ).toMatchObject({
      ok: false,
      status: 409,
    });
    expect((await lpGet(`/_preview/${id}/`)).status).toBe(404);
  });

  test("versions belong to their own campaign: another campaign's upload never touches this one", async () => {
    const other = (
      sql
        .query(
          `INSERT INTO campaigns (slug, locale, title, status, position) VALUES ('tet-2027', 'vi', 'Tết 2027', 'live', 1) RETURNING id`,
        )
        .get() as { id: number }
    ).id;
    const mine = await readyVersion();
    await call("editor", "publishLandingVersionFn", { version_id: mine, confirm_critical: true });
    const up = await upload("editor", sampleZip(), { campaign: other });
    const theirs = up.body.version!.id;
    await call("editor", "processLandingVersionFn", { version_id: theirs });
    await call("editor", "publishLandingVersionFn", { version_id: theirs, confirm_critical: true });
    expect(campaignRow().landing_version_id).toBe(mine);
    expect(
      [...r2.store.keys()]
        .filter((k) => k.includes(theirs))
        .every((k) => k.startsWith(`landings/tet-2027/${theirs}/`)),
    ).toBe(true);
    expect(await (await lpGet("/tet-2027/")).text()).toContain('data-slug="tet-2027"');
    // A preview id of one campaign is served from that campaign's prefix only.
    expect((await lpGet(`/christmas-2026/${theirs}/index.html`)).status).toBe(404);
  });

  test("deleting the campaign removes its version rows; the R2 files stay behind (known gap)", async () => {
    const id = await readyVersion();
    await call("editor", "publishLandingVersionFn", { version_id: id, confirm_critical: true });
    await campaigns.deleteCampaign(USERS.admin, campaignId);
    expect(count("campaign_landing_versions")).toBe(0);
    expect((await lpGet("/christmas-2026/")).status).toBe(404);
    expect((await lpGet(`/_preview/${id}/`)).status).toBe(404);
    // KNOWN GAP: nothing deletes landings/christmas-2026/<id>/… — unreferenced, unreachable
    // through lp (both lookups need a row), but they stay in the bucket.
    expect(
      [...r2.store.keys()].filter((k) => k.startsWith("landings/christmas-2026/")).length,
    ).toBeGreaterThan(0);
  });
});

describe("a hostile model during processing: stored output is the deterministic page", () => {
  const anthropic = (reply: unknown) =>
    (async () =>
      new Response(
        JSON.stringify({
          id: "msg_x",
          type: "message",
          role: "assistant",
          model: "claude-opus-5-5",
          content: [{ type: "text", text: JSON.stringify(reply) }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;

  test("an edit on a content id is refused, the reason recorded, and R2 holds the deterministic bytes", async () => {
    const up = await upload("editor", sampleZip());
    const id = up.body.version!.id;
    // Same hostile answer for both steps: invalid as an edit list (cross-kind id) and as an audit.
    const ai = createLandingAi({
      apiKey: "sk-ant-test",
      baseURL: "https://api.anthropic.test",
      maxRetries: 0,
      fetch: anthropic({
        edits: [{ op: "fix_brand", target: "c1", replacement: "TH Group" }],
        notes: "",
        findings: "none",
      }),
    });
    current = requestAs("editor");
    const ready = await service.processLanding({ ...server.landingDeps(), ai }, id);
    expect(ready.status).toBe("ready");
    const stored = new TextDecoder().decode(
      r2.store.get(`landings/christmas-2026/${id}/site/index.html`),
    );
    expect(stored).toBe(normalizeLandingHtml(SAMPLE, "christmas-2026").html);
    const report = JSON.parse(ready.report_json);
    expect(report.format.mode).toBe("deterministic");
    expect(report.format.note).toContain("không tồn tại: c1");
    expect(report.audit.mode).toBe("rules");
    const findings = JSON.parse(ready.findings_json) as {
      category: string;
      message: string;
      evidence: string;
    }[];
    const aiNote = findings.find((f) => f.category === "ai");
    expect(aiNote?.message).toContain("Bước AI bị lỗi");
    expect(aiNote?.evidence).toContain("không tồn tại: c1");
  });
});
