// Upload → process → publish → serve → rollback against real SQLite (the full
// migration chain, so 0062's Christmas seed and 0063's tables are the schema
// under test), an in-memory R2 bucket and the real lp-host bindings. Every
// other Worker boundary is a recorder.

import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { makeZip, type ZipInput } from "./__fixtures__/make-zip";
import type { JsonAiCall } from "./landing.format";
import { handleLandingRequest } from "./landing.host";
import { landingHostDeps } from "./landing.host.server";
import { leadScriptTag } from "./landing.normalize";
import {
  listLandingVersions,
  processLanding,
  publishLanding,
  rollbackLanding,
  uploadLanding,
  type LandingDeps,
} from "./landing.service";

const dir = import.meta.dir;
const SAMPLE = readFileSync(join(dir, "__fixtures__", "xmas-index.html"), "utf8");
const ACTOR = 9;
const LP = "https://lp.thgfulfill.com";

// ── D1 over bun:sqlite ───────────────────────────────────────────────────────
let sql: Database;
function statement(query: string, args: unknown[] = []) {
  const params = args as never[];
  return {
    bind: (...values: unknown[]) => statement(query, values),
    first: async () => sql.query(query).get(...params) ?? null,
    all: async () => ({ results: sql.query(query).all(...params) }),
    run: async () => ({
      success: true,
      meta: { changes: sql.query(query).run(...params).changes },
    }),
  };
}
const db = { prepare: (query: string) => statement(query) } as unknown as D1Database;

// ── R2 in memory ─────────────────────────────────────────────────────────────
const store = new Map<string, Uint8Array>();
const objectOf = (key: string, data: Uint8Array) => ({
  key,
  size: data.byteLength,
  httpEtag: `"${data.byteLength}"`,
  body: new Blob([data as BlobPart]).stream(),
  text: async () => new TextDecoder().decode(data),
});
const bucket = {
  put: async (key: string, value: Uint8Array) => {
    store.set(key, new Uint8Array(value));
    return null;
  },
  get: async (key: string) => {
    const data = store.get(key);
    return data ? objectOf(key, data) : null;
  },
  delete: async (keys: string | string[]) => {
    for (const key of Array.isArray(keys) ? keys : [keys]) store.delete(key);
  },
  head: async (key: string) => {
    const data = store.get(key);
    return data ? { size: data.byteLength, httpEtag: `"${data.byteLength}"` } : null;
  },
} as unknown as R2Bucket;

// ── Recorders ────────────────────────────────────────────────────────────────
let audits: { action: string; entity: string; before: unknown; after: unknown }[];
let bumps: number;
let dispatched: { event_type: string; idempotency_key: string; payload: Record<string, unknown> }[];
let nextId: number;

function deps(ai: JsonAiCall | null = null): LandingDeps {
  return {
    db,
    bucket,
    ai,
    prompts: { format: "FORMAT PROMPT", audit: "AUDIT PROMPT" },
    auditLog: async (_actor, action, entity, _id, before, after) => {
      audits.push({ action, entity, before, after });
    },
    bumpCmsRev: async () => {
      bumps++;
    },
    dispatch: async (input) => {
      dispatched.push(input as unknown as (typeof dispatched)[number]);
    },
    landingOrigin: LP,
    adminOrigin: "https://cms.thgfulfill.com",
    newVersionId: () => (nextId++).toString(16).padStart(32, "0"),
    today: () => "2026-10-24",
  };
}

const lpHost = () =>
  landingHostDeps({
    DB: db,
    MEDIA: bucket,
    BASE_URL: "https://cms.thgfulfill.com",
    TURNSTILE_SITE_KEY: "0x4AAA-test",
  });
const getLp = (path: string) => handleLandingRequest(new Request(`${LP}${path}`), lpHost());

let snapshot: Uint8Array;
let campaignId: number;
beforeAll(() => {
  const migrations = resolve(dir, "../../../../db/migrations");
  const fresh = new Database(":memory:");
  for (const file of readdirSync(migrations)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    fresh.exec(readFileSync(join(migrations, file), "utf8"));
  }
  fresh.exec(
    `INSERT INTO users(id,email,name,role,status,password_hash) VALUES(${ACTOR},'mkt@thg.test','Marketing','editor','active','x');`,
  );
  snapshot = fresh.serialize();
  fresh.close();
});
beforeEach(() => {
  sql = Database.deserialize(snapshot);
  store.clear();
  audits = [];
  bumps = 0;
  dispatched = [];
  nextId = 1;
  campaignId = (
    sql.query(`SELECT id FROM campaigns WHERE slug = 'christmas-2026'`).get() as { id: number }
  ).id;
});

const sampleZip = (extra: ZipInput[] = []) =>
  makeZip([{ name: "christmas/index.html", data: SAMPLE }, ...extra]);
const campaignRow = () =>
  sql
    .query(`SELECT landing_path, landing_version_id FROM campaigns WHERE id = ?`)
    .get(campaignId) as {
    landing_path: string;
    landing_version_id: string | null;
  };
const text = (key: string) => new TextDecoder().decode(store.get(key));

/** Stub at the JsonAiCall seam, answering per prompt. */
const stubAi =
  (format: unknown, audit: unknown): JsonAiCall =>
  async (request) => ({
    parsed: (request.system === "FORMAT PROMPT" ? format : audit) as Record<string, unknown>,
    error: null,
    usage: { model: "claude-opus-5-5", input_tokens: 10, output_tokens: 5 },
  });

describe("upload", () => {
  test("stores the source, the deterministic index and the assets under an immutable version prefix", async () => {
    const v = await uploadLanding(deps(), ACTOR, {
      campaignId,
      fileName: "christmas.zip",
      zip: sampleZip([{ name: "christmas/assets/hero-christmas-market-navy.jpg", data: "jpg" }]),
    });
    expect(v.status).toBe("processing");
    expect(v.id).toMatch(/^[a-f0-9]{32}$/);
    expect(JSON.parse(v.files_json).sort()).toEqual([
      "assets/hero-christmas-market-navy.jpg",
      "index.html",
    ]);
    const prefix = `landings/christmas-2026/${v.id}`;
    expect(text(`${prefix}/source/index.html`)).toBe(SAMPLE);
    expect(text(`${prefix}/site/index.html`)).toContain('data-thg-lead data-slug="christmas-2026"');
    expect(text(`${prefix}/site/assets/hero-christmas-market-navy.jpg`)).toBe("jpg");
    expect(JSON.parse(v.report_json).warnings).toEqual([
      'Đã bỏ thư mục gốc "christmas/" trong ZIP.',
    ]);
    expect(audits.map((a) => `${a.action}:${a.entity}`)).toEqual([
      "create:campaign_landing_versions",
    ]);
    // Uploading publishes nothing.
    expect(campaignRow()).toEqual({ landing_path: "/christmas", landing_version_id: null });
    expect(bumps).toBe(0);
  });

  test("a bad bundle stores nothing", async () => {
    await expect(
      uploadLanding(deps(), ACTOR, {
        campaignId,
        fileName: "bad.zip",
        zip: makeZip([
          { name: "index.html", data: "x" },
          { name: "../x.js", data: "x" },
        ]),
      }),
    ).rejects.toThrow(/\.\./);
    expect(store.size).toBe(0);
    expect(sql.query(`SELECT COUNT(*) AS n FROM campaign_landing_versions`).get()).toEqual({
      n: 0,
    });
  });
});

describe("process", () => {
  test("without AI: deterministic output, rule findings saved, one Telegram report", async () => {
    const v = await uploadLanding(deps(), ACTOR, {
      campaignId,
      fileName: "c.zip",
      zip: sampleZip(),
    });
    const ready = await processLanding(deps(null), v.id);
    expect(ready.status).toBe("ready");
    const findings = JSON.parse(ready.findings_json) as { severity: string; category: string }[];
    expect(findings[0]).toMatchObject({ severity: "critical", category: "asset" });
    expect(findings.filter((f) => f.category === "price")).toHaveLength(2);
    expect(findings.at(-1)).toMatchObject({ category: "ai", severity: "minor" });
    expect([ready.critical_count, ready.major_count]).toEqual([1, 4]); // critical: assets · major: brand, mailto, 2× price
    const report = JSON.parse(ready.report_json);
    expect(report.format.mode).toBe("deterministic");
    // Uploaded bytes vs served bytes: the only deterministic change is the script tag.
    // +1 for the line break injectLeadScript puts before the tag.
    const tagBytes = leadScriptTag("christmas-2026", "vi").length + 1;
    expect(report.format.diff.bytesBefore).toBe(Buffer.byteLength(SAMPLE));
    expect(report.format.diff.bytesAfter - report.format.diff.bytesBefore).toBe(tagBytes);
    expect(report.audit.mode).toBe("rules");

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].event_type).toBe("landing_review");
    expect(dispatched[0].idempotency_key).toBe(`landing_review:${v.id}`);
    expect(dispatched[0].payload).toMatchObject({
      campaign_slug: "christmas-2026",
      version_id: v.id,
      uploader: "Marketing",
      critical: 1,
      major: 4,
      format_mode: "deterministic",
      audit_mode: "rules",
      editor_url: "https://cms.thgfulfill.com/admin/content/campaigns/christmas-2026",
      preview_url: `${LP}/_preview/${v.id}/`,
    });
    expect((dispatched[0].payload.top as unknown[]).length).toBe(6);
  });

  test("with AI: the validated edit list is applied and AI findings are merged", async () => {
    const v = await uploadLanding(deps(), ACTOR, {
      campaignId,
      fileName: "c.zip",
      zip: sampleZip(),
    });
    const ai = stubAi(
      { edits: [{ op: "replace_header", target: "h1", replacement: "none" }], notes: "" },
      {
        findings: [
          {
            severity: "critical",
            category: "origin",
            message: "Hero ghi Made in USA nhưng có hàng Made in VN.",
            evidence: "Made in VN",
          },
        ],
      },
    );
    const ready = await processLanding(deps(ai), v.id);
    const site = text(`landings/christmas-2026/${v.id}/site/index.html`);
    expect(site).toContain("<!-- thg:header:start -->");
    expect(site).not.toContain('<header class="header">');
    expect(JSON.parse(ready.report_json).format.mode).toBe("ai");
    expect(ready.critical_count).toBe(2);
    const sources = (JSON.parse(ready.findings_json) as { source: string }[]).map((f) => f.source);
    expect(sources).toContain("ai");
  });
});

describe("publish, serve and rollback", () => {
  async function readyVersion(extra: ZipInput[] = [], ai: JsonAiCall | null = null) {
    const v = await uploadLanding(deps(), ACTOR, {
      campaignId,
      fileName: "c.zip",
      zip: sampleZip(extra),
    });
    return processLanding(deps(ai), v.id);
  }

  test("critical findings need the explicit confirm; publishing sets landing_path and bumps the rev", async () => {
    const v = await readyVersion();
    await expect(
      publishLanding(deps(), ACTOR, { versionId: v.id, confirmCritical: false }),
    ).rejects.toThrow(/Vẫn xuất bản/);
    expect(campaignRow().landing_version_id).toBeNull();
    expect(bumps).toBe(0);

    const result = await publishLanding(deps(), ACTOR, { versionId: v.id, confirmCritical: true });
    expect(result.landing_path).toBe(`${LP}/christmas-2026/`);
    expect(campaignRow()).toEqual({
      landing_path: `${LP}/christmas-2026/`,
      landing_version_id: v.id,
    });
    expect(bumps).toBe(1);
    expect(audits.at(-1)).toEqual({
      action: "publish",
      entity: "campaigns",
      before: { landing_version_id: null, landing_path: "/christmas" },
      after: { landing_version_id: v.id, landing_path: `${LP}/christmas-2026/` },
    });

    // The lp host now serves it; the public campaigns API reads the new landing_path.
    const page = await getLp("/christmas-2026/");
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<script src="/_thg/thg-lead.js" data-thg-lead');
    const script = await (await getLp("/_thg/thg-lead.js")).text();
    expect(
      script.startsWith(
        'window.__THG_LEAD__ = {"endpoint":"https://cms.thgfulfill.com/api/v1/leads","turnstileSiteKey":"0x4AAA-test"};',
      ),
    ).toBe(true);
    expect(script).toContain("landing:");
  });

  test("a version still processing cannot be published, but can be previewed", async () => {
    const v = await uploadLanding(deps(), ACTOR, {
      campaignId,
      fileName: "c.zip",
      zip: sampleZip(),
    });
    await expect(
      publishLanding(deps(), ACTOR, { versionId: v.id, confirmCritical: true }),
    ).rejects.toThrow(/chưa xử lý xong/);
    const preview = await getLp(`/_preview/${v.id}/`);
    expect(preview.status).toBe(200);
    expect(preview.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect((await getLp("/christmas-2026/")).status).toBe(404);
  });

  test("rollback steps back through the publish history", async () => {
    const assets = SAMPLE.match(/assets\/[\w./-]+\.jpg/g)!.map((p) => ({
      name: `christmas/${p}`,
      data: "j",
    }));
    const imgs = [...SAMPLE.matchAll(/img:"([\w.-]+)"/g)].map((m) => ({
      name: `christmas/assets/products/${m[1]}`,
      data: "j",
    }));
    const unique = [...new Map([...assets, ...imgs].map((a) => [a.name, a])).values()];
    const v1 = await readyVersion();
    await publishLanding(deps(), ACTOR, { versionId: v1.id, confirmCritical: true });
    const v2 = await readyVersion(unique);
    expect(v2.critical_count).toBe(0);
    await publishLanding(deps(), ACTOR, { versionId: v2.id, confirmCritical: false });
    expect(campaignRow().landing_version_id).toBe(v2.id);

    const back = await rollbackLanding(deps(), ACTOR, campaignId);
    expect(back.version_id).toBe(v1.id);
    expect(campaignRow()).toEqual({
      landing_path: `${LP}/christmas-2026/`,
      landing_version_id: v1.id,
    });
    expect(audits.at(-1)).toMatchObject({
      action: "rollback",
      after: { landing_version_id: v1.id },
    });
    expect(bumps).toBe(3);
    await expect(rollbackLanding(deps(), ACTOR, campaignId)).rejects.toThrow(/Không có phiên bản/);

    const listing = await listLandingVersions(deps(), campaignId);
    expect(listing.live_url).toBe(`${LP}/christmas-2026/`);
    expect(listing.versions.map((v) => [v.id, v.is_live, v.uploader])).toEqual([
      [v2.id, false, "Marketing"],
      [v1.id, true, "Marketing"],
    ]);
    expect(listing.versions[1].findings.length).toBeGreaterThan(0);
  });
});

describe("processing runs once per version", () => {
  test("a ready version cannot be re-processed: served page, findings and report stay put", async () => {
    const v = await uploadLanding(deps(), ACTOR, {
      campaignId,
      fileName: "c.zip",
      zip: sampleZip(),
    });
    const ready = await processLanding(deps(null), v.id);
    const key = `landings/christmas-2026/${v.id}/site/index.html`;
    const served = text(key);
    const ai = stubAi(
      { edits: [{ op: "replace_header", target: "h1", replacement: "none" }], notes: "" },
      { findings: [] },
    );
    await expect(processLanding(deps(ai), v.id)).rejects.toThrow(/đã xử lý xong/);
    expect(text(key)).toBe(served);
    expect(dispatched).toHaveLength(1);
    const row = sql
      .query(`SELECT findings_json, processed_at FROM campaign_landing_versions WHERE id = ?`)
      .get(v.id);
    expect(row).toEqual({ findings_json: ready.findings_json, processed_at: ready.processed_at });
  });

  test("a version being processed (fresh claim) is not processed twice; an abandoned claim is", async () => {
    const v = await uploadLanding(deps(), ACTOR, {
      campaignId,
      fileName: "c.zip",
      zip: sampleZip(),
    });
    sql
      .query(`UPDATE campaign_landing_versions SET processed_at = unixepoch() WHERE id = ?`)
      .run(v.id);
    await expect(processLanding(deps(null), v.id)).rejects.toThrow(/đang được xử lý/);
    sql
      .query(`UPDATE campaign_landing_versions SET processed_at = unixepoch() - 3600 WHERE id = ?`)
      .run(v.id);
    expect((await processLanding(deps(null), v.id)).status).toBe("ready");
    expect(dispatched).toHaveLength(1);
  });
});

describe("a failed upload leaves no R2 objects behind", () => {
  test("when the D1 insert fails after the files were written", async () => {
    const failingDb = {
      prepare(query: string) {
        if (query.includes("INSERT INTO campaign_landing_versions")) {
          throw new Error("D1_ERROR: simulated outage");
        }
        return db.prepare(query);
      },
    } as unknown as D1Database;
    await expect(
      uploadLanding({ ...deps(), db: failingDb }, ACTOR, {
        campaignId,
        fileName: "c.zip",
        zip: sampleZip([{ name: "christmas/assets/a.png", data: "png" }]),
      }),
    ).rejects.toThrow(/simulated outage/);
    expect([...store.keys()]).toEqual([]);
    expect(audits).toEqual([]);
  });

  test("when an R2 write fails part-way", async () => {
    let puts = 0;
    const flaky = {
      ...bucket,
      put: async (key: string, value: Uint8Array) => {
        if (++puts === 3) throw new Error("R2 unavailable");
        return bucket.put(key, value);
      },
    } as unknown as R2Bucket;
    const zip = sampleZip(
      Array.from({ length: 5 }, (_, i) => ({ name: `christmas/assets/${i}.png`, data: "p" })),
    );
    await expect(
      uploadLanding({ ...deps(), bucket: flaky }, ACTOR, { campaignId, fileName: "c.zip", zip }),
    ).rejects.toThrow(/R2 unavailable/);
    expect([...store.keys()]).toEqual([]);
    expect(sql.query(`SELECT COUNT(*) AS n FROM campaign_landing_versions`).get()).toEqual({
      n: 0,
    });
  });
});
