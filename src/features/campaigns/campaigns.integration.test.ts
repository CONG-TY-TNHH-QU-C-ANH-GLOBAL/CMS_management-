// Campaigns against real SQLite semantics: the full migration chain (0001 → 0062),
// the public route handlers, the service SQL (live filter, ordering, reviewed-
// translation overlay) and the admin write path (roles, audit, cache bump,
// translation staleness). Oracle: runs/xmas-campaigns-20261024/contract.md.
//
// Same isolation approach as blog-event.integrity.test.ts: production modules
// are transpiled and run in a VM context whose only stubs are the Worker
// boundaries (D1 client → bun:sqlite adapter, cloudflare:workers env, session
// auth, router factories, Telegram) and the network (`fetch`, which only a
// test-installed fake translation model answers). The VM's `Date` is pinned so
// "today in Asia/Ho_Chi_Minh" is controlled without touching production code.
// The flow tests at the end walk whole operator journeys and the shared
// CMS ↔ landing golden file (see the "golden" section for how to refresh it).

import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";

import {
  campaignResponseSchema,
  campaignsResponseSchema,
  type PublicCampaign,
  type PublicCampaignDetail,
} from "./campaigns.schemas";

// Route bodies as received: success shape or the { error } envelope.
type ListBody = { locale: string; campaigns: PublicCampaign[] };
type ErrorBody = { error: string };
type DetailBody = {
  campaign: PublicCampaignDetail;
  available_locales: string[];
};

// ── Controlled clock ─────────────────────────────────────────────────────────
let nowMs = Date.parse("2026-10-24T03:00:00Z");
class PinnedDate extends Date {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(nowMs);
    else super(...(args as [string]));
  }
  static now() {
    return nowMs;
  }
}
/** Sets the VM clock to a wall-clock time in Ho Chi Minh City (UTC+7). */
const setVnTime = (isoLocal: string) => {
  nowMs = Date.parse(`${isoLocal}+07:00`);
};

// ── D1 adapter over bun:sqlite ───────────────────────────────────────────────
let sql: Database;
const db = {
  prepare(query: string) {
    const bound = (args: unknown[]) => ({
      bind: (...values: unknown[]) => bound(values),
      execute() {
        const result = sql.query(query).run(...(args as never[]));
        return { success: true, meta: { changes: result.changes } };
      },
      async first() {
        return sql.query(query).get(...(args as never[]));
      },
      async all() {
        return { results: sql.query(query).all(...(args as never[])) };
      },
      async run() {
        return this.execute();
      },
    });
    return bound([]);
  },
  async batch(statements: Array<{ execute(): unknown }>) {
    return sql.transaction(() => statements.map((statement) => statement.execute()))();
  },
};

// ── Boundaries ───────────────────────────────────────────────────────────────
const refuseNetwork = (url: string): Promise<Response> => {
  throw new Error(`Network call from a campaign code path: ${url}`);
};
let networkStub: (url: string, init?: RequestInit) => Promise<Response> = refuseNetwork;
let kvPuts: Array<[string, string]> = [];
let sessionRoles: string[] = [];
let sessionAllows: (role: string) => boolean = () => true;
const ACTOR = 9;

const boundaries: Record<string, unknown> = {
  "@/core/db/client": { getDb: () => db, nowSeconds: () => Math.floor(nowMs / 1000) },
  "cloudflare:workers": {
    env: { CMS_REV: { put: async (key: string, value: string) => void kvPuts.push([key, value]) } },
  },
  "@/features/telegram": { dispatchEvent: async () => {} },
  "@/features/media": { getMedia: async () => null },
  "@/features/auth": {
    requireSession: async (role: string) => {
      sessionRoles.push(role);
      if (!sessionAllows(role)) throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
      return { id: ACTOR, role };
    },
  },
  "@tanstack/react-router": {
    createFileRoute: (path: string) => (options: unknown) => ({ path, options }),
  },
  "@tanstack/react-start": {
    createServerFn: () => {
      const fn: { validator?: (data: unknown) => unknown } = {};
      const builder = {
        inputValidator(validator: (data: unknown) => unknown) {
          fn.validator = validator;
          return builder;
        },
        handler: () => fn,
      };
      return builder;
    },
  },
};

const directory = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(directory, "../..");
const dependencyRequire = createRequire(import.meta.url);
const modules = new Map<string, { exports: unknown }>();
const toFile = (base: string) =>
  [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((path) => existsSync(path)) ??
  `${base}.ts`;
function load(absolute: string): unknown {
  if (modules.has(absolute)) return modules.get(absolute)!.exports;
  const module = { exports: {} };
  modules.set(absolute, module);
  const code = ts
    .transpileModule(readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    })
    .outputText.replaceAll("import.meta", "__importMeta"); // vm scripts are not ESM
  const scopedRequire = (id: string): unknown => {
    if (id in boundaries) return boundaries[id];
    if (id.startsWith("@/")) return load(toFile(resolve(sourceRoot, id.slice(2))));
    if (id.startsWith(".")) return load(toFile(resolve(dirname(absolute), id)));
    return dependencyRequire(id);
  };
  runInNewContext(
    code,
    {
      module,
      exports: module.exports,
      require: scopedRequire,
      console,
      crypto,
      TextEncoder,
      URL,
      Request,
      Response,
      Headers,
      Date: PinnedDate,
      setTimeout,
      clearTimeout,
      AbortController,
      __importMeta: { env: { PROD: false } },
      // The only network boundary a campaign path may reach is the translation
      // model (OpenAI chat completions); tests install a fake per case.
      fetch: (input: unknown, init?: RequestInit) => networkStub(String(input), init),
    },
    { filename: absolute },
  );
  return module.exports;
}

type Handler = (ctx: { request: Request; params?: Record<string, string> }) => Promise<Response>;
type RouteModule = { Route: { options: { server: { handlers: { GET: Handler } } } } };
const routesDir = resolve(sourceRoot, "routes/api/v1/(public)/campaigns");
const listRoute = load(resolve(routesDir, "index.ts")) as RouteModule;
const detailRoute = load(resolve(routesDir, "$slug.ts")) as RouteModule;
const server = load(
  resolve(directory, "campaigns.server.ts"),
) as typeof import("./campaigns.server");
const actions = load(resolve(directory, "campaigns.actions.ts")) as Record<
  string,
  { validator: (data: unknown) => Record<string, unknown> }
>;

async function getList<T = ListBody>(lang?: string) {
  const qs = lang === undefined ? "" : `?lang=${lang}`;
  const response = await listRoute.Route.options.server.handlers.GET({
    request: new Request(`https://cms.test/api/v1/campaigns${qs}`),
  });
  return { status: response.status, body: (await response.json()) as T };
}
async function getDetail<T = DetailBody>(slug: string, lang?: string) {
  const qs = lang === undefined ? "" : `?lang=${lang}`;
  const response = await detailRoute.Route.options.server.handlers.GET({
    request: new Request(`https://cms.test/api/v1/campaigns/${slug}${qs}`),
    params: { slug },
  });
  return { status: response.status, body: (await response.json()) as T };
}

// ── Database lifecycle: apply every migration once, clone per test ───────────
let snapshot: Uint8Array;
beforeAll(() => {
  const migrationsDir = resolve(sourceRoot, "../db/migrations");
  const fresh = new Database(":memory:");
  for (const file of readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    fresh.exec(readFileSync(resolve(migrationsDir, file), "utf8"));
  }
  fresh.exec(
    `INSERT INTO users(id,email,name,role,status,password_hash) VALUES(${ACTOR},'ed@thg.test','Editor','editor','active','test-only');`,
  );
  snapshot = fresh.serialize();
  fresh.close();
});
beforeEach(() => {
  sql = Database.deserialize(snapshot);
  kvPuts = [];
  networkStub = refuseNetwork;
  sessionRoles = [];
  sessionAllows = () => true;
  setVnTime("2026-10-24T10:00:00");
});

/** Insert a VI campaign row; returns its id. */
function insertCampaign(values: Record<string, unknown>): number {
  const row = { locale: "vi", status: "live", position: 0, ...values };
  const keys = Object.keys(row);
  const inserted = sql
    .query(
      `INSERT INTO campaigns (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")}) RETURNING id`,
    )
    .get(...(Object.values(row) as never[])) as { id: number };
  return inserted.id;
}
function insertTranslation(values: Record<string, unknown>): number {
  const row = { locale: "en", status: "reviewed", source_hash: "h", ...values };
  const keys = Object.keys(row);
  const inserted = sql
    .query(
      `INSERT INTO campaign_translations (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")}) RETURNING id`,
    )
    .get(...(Object.values(row) as never[])) as { id: number };
  return inserted.id;
}
const clearSeed = () => sql.exec("DELETE FROM campaign_translations; DELETE FROM campaigns;");

// Field lists copied from contract.md, independent of campaigns.schemas.ts.
const CONTRACT_LIST_KEYS = [
  "slug",
  "title",
  "summary",
  "cover_url",
  "og_image_url",
  "start_date",
  "end_date",
  "position",
  "landing_path",
  "cta_label",
  "nav_featured",
  "nav_label",
  "nav_badge",
  "home_featured",
  "menu_items",
  "updated_at",
];
const CONTRACT_DETAIL_KEYS = [...CONTRACT_LIST_KEYS, "body_md", "seo_title", "seo_description"];

// ── Migration 0062 + seed ────────────────────────────────────────────────────

describe("migration 0062 seed (contract § Seed)", () => {
  const SEED_MENU = [
    ["🎁", "Christmas Collection", "Xem tất cả sản phẩm Giáng sinh", "/catalog/christmas"],
    ["🔥", "Best Seller", "Sản phẩm bán tốt mùa lễ", "/catalog/best-seller"],
    ["🆕", "New Arrival", "Sản phẩm mới", "/catalog/new-arrivals"],
    ["🇺🇸", "Fulfill tại Mỹ", "Sản phẩm sản xuất/giao nhanh từ Mỹ", "/christmas#san-pham"],
    ["👕", "Apparel", "Hoodie, Sweater, Jersey…", "/christmas#san-pham"],
    ["🎄", "Home & Gifts", "Pillow, ornament, decoration…", "/christmas#san-pham"],
    ["🏷️", "Special Offers", "Sản phẩm đang có ưu đãi", "/christmas#hot"],
    ["📒", "Christmas Catalog", "Xem toàn bộ catalog", "/christmas#san-pham"],
  ].map(([icon, title, subtitle, href]) => ({ icon, title, subtitle, href }));

  test("the VI list serves the seeded Christmas campaign exactly as the contract specifies", async () => {
    const { status, body } = await getList("vi");
    expect(status).toBe(200);
    expect(body.locale).toBe("vi");
    expect(body.campaigns).toHaveLength(1);
    const xmas = body.campaigns[0];
    expect(xmas).toMatchObject({
      slug: "christmas-2026",
      start_date: "2026-10-24",
      end_date: "2026-12-25",
      landing_path: "/christmas",
      cta_label: "Khám phá bộ sưu tập",
      nav_featured: true,
      nav_label: "Christmas",
      nav_badge: "NEW",
      home_featured: true,
      cover_url: null,
    });
    expect(xmas.menu_items).toEqual(SEED_MENU);
  });

  test("the seeded EN translation is reviewed and overlays CTA; icons and hrefs stay VI", async () => {
    const { body } = await getList("en");
    const xmas = body.campaigns[0];
    expect(xmas.cta_label).toBe("Explore Collection");
    expect(xmas.menu_items.map((m: { icon: string }) => m.icon)).toEqual(
      SEED_MENU.map((m) => m.icon),
    );
    expect(xmas.menu_items.map((m: { href: string }) => m.href)).toEqual(
      SEED_MENU.map((m) => m.href),
    );
    expect(xmas.menu_items[3].title).toBe("US Fulfillment");
    const detail = await getDetail("christmas-2026", "en");
    expect(detail.body.available_locales).toEqual(["vi", "en"]);
  });

  test("the seed is idempotent: re-running 0062's INSERTs adds no rows", () => {
    const migration = readFileSync(
      resolve(sourceRoot, "../db/migrations/0062_campaigns.sql"),
      "utf8",
    );
    const seedOnly = migration.slice(migration.indexOf("INSERT OR IGNORE INTO campaigns"));
    sql.exec(seedOnly);
    expect(sql.query("SELECT COUNT(*) n FROM campaigns").get()).toEqual({ n: 1 });
    expect(sql.query("SELECT COUNT(*) n FROM campaign_translations").get()).toEqual({ n: 1 });
  });

  test("schema CHECKs reject a non-VI source row and an unknown status", () => {
    expect(() => insertCampaign({ slug: "x", title: "X", locale: "en" })).toThrow();
    expect(() => insertCampaign({ slug: "y", title: "Y", status: "published" })).toThrow();
  });
});

// ── Public list ──────────────────────────────────────────────────────────────

describe("GET /api/v1/campaigns", () => {
  test("returns only live campaigns, ordered by position then start_date DESC", async () => {
    clearSeed();
    insertCampaign({ slug: "p1-old", title: "P1 old", position: 1, start_date: "2026-01-01" });
    insertCampaign({ slug: "p0-draft", title: "draft", position: 0, status: "draft" });
    insertCampaign({ slug: "p1-new", title: "P1 new", position: 1, start_date: "2026-06-01" });
    insertCampaign({ slug: "p0-archived", title: "arch", position: 0, status: "archived" });
    insertCampaign({ slug: "p2", title: "P2", position: 2, start_date: "2027-01-01" });
    insertCampaign({ slug: "p0", title: "P0", position: 0, start_date: "2025-01-01" });
    const { body } = await getList("vi");
    expect(body.campaigns.map((c: { slug: string }) => c.slug)).toEqual([
      "p0",
      "p1-new",
      "p1-old",
      "p2",
    ]);
  });

  test("an invalid lang is a 400; a missing lang defaults to vi", async () => {
    expect(await getList<ErrorBody>("fr")).toEqual({
      status: 400,
      body: { error: "Invalid lang" },
    });
    const missing = await getList();
    expect(missing.status).toBe(200);
    expect(missing.body.locale).toBe("vi");
  });

  test("response matches the contract's keys exactly and parses strictly", async () => {
    const { body } = await getList("en");
    expect(Object.keys(body).sort()).toEqual(["campaigns", "locale"]);
    expect(Object.keys(body.campaigns[0]).sort()).toEqual([...CONTRACT_LIST_KEYS].sort());
    expect(Object.keys(body.campaigns[0].menu_items[0]).sort()).toEqual([
      "href",
      "icon",
      "subtitle",
      "title",
    ]);
    expect(() =>
      campaignsResponseSchema
        .extend({ campaigns: campaignsResponseSchema.shape.campaigns.element.strict().array() })
        .strict()
        .parse(body),
    ).not.toThrow();
  });

  test("cover_url and og_image_url resolve from media; missing media is null", async () => {
    sql.exec(
      "INSERT INTO media(id,r2_key,mime,bytes,status) VALUES(41,'xmas-cover.webp','image/webp',1,'ready');",
    );
    sql.exec("UPDATE campaigns SET cover_media_id = 41, og_image_id = 999");
    const xmas = (await getList("vi")).body.campaigns[0];
    // Absolute on the request origin, so the landing can use it cross-site.
    expect(xmas.cover_url).toBe("https://cms.test/api/v1/media/xmas-cover.webp");
    expect(xmas.og_image_url).toBeNull();
  });

  test("malformed VI menu JSON publishes as [] instead of failing the list", async () => {
    sql.exec("UPDATE campaigns SET menu_items_json = '{oops'");
    const { status, body } = await getList("en");
    expect(status).toBe(200);
    expect(body.campaigns[0].menu_items).toEqual([]);
  });
});

// ── Effective flags (contract: toggle AND live AND VN today <= end_date) ─────

describe("effective nav_featured / home_featured through the route", () => {
  const flags = async () => {
    const xmas = (await getList("vi")).body.campaigns[0];
    return [xmas.nav_featured, xmas.home_featured];
  };

  test("the end date itself counts until 23:59 VN; 00:00 VN the next day turns both off", async () => {
    setVnTime("2026-12-25T23:59:00");
    expect(await flags()).toEqual([true, true]);
    setVnTime("2026-12-26T00:00:00");
    expect(await flags()).toEqual([false, false]);
  });

  test("the campaign stays listed after expiry; only the flags drop", async () => {
    setVnTime("2027-02-01T12:00:00");
    const { body } = await getList("vi");
    expect(body.campaigns.map((c: { slug: string }) => c.slug)).toEqual(["christmas-2026"]);
    expect(body.campaigns[0].nav_featured).toBe(false);
  });

  test("UTC is not the reference: 2026-12-25T17:30Z is already Dec 26 in VN", async () => {
    nowMs = Date.parse("2026-12-25T17:30:00Z");
    expect(await flags()).toEqual([false, false]);
  });

  test("a null end_date never expires; a toggle that is off stays off", async () => {
    sql.exec("UPDATE campaigns SET end_date = NULL, home_featured = 0");
    setVnTime("2030-01-01T12:00:00");
    expect(await flags()).toEqual([true, false]);
  });
});

// ── Translation overlay ──────────────────────────────────────────────────────

describe("en/zh reviewed-translation overlay with VI fallback", () => {
  let id: number;
  beforeEach(() => {
    clearSeed();
    id = insertCampaign({
      slug: "tet",
      title: "Tết VI",
      summary: "Tóm tắt",
      body_md: "Nội dung",
      cta_label: "Xem ngay",
      nav_label: "Tết",
      nav_badge: "HOT",
      landing_path: "/tet",
      seo_title: "SEO VI",
      seo_description: "Mô tả VI",
      menu_items_json: JSON.stringify([
        { icon: "🧧", title: "Lì xì", subtitle: "Phụ đề 1", href: "/tet#a" },
        { icon: "🎆", title: "Pháo hoa", subtitle: "Phụ đề 2", href: "/tet#b" },
      ]),
    });
  });

  test("a reviewed EN row replaces every translated field; non-translated fields stay VI", async () => {
    insertTranslation({
      campaign_id: id,
      title: "Tet EN",
      summary: "Summary EN",
      body_md: "Body EN",
      cta_label: "See now",
      nav_label: "Tet",
      seo_title: "SEO EN",
      seo_description: "Desc EN",
      // Different icon/href and a shorter menu: icon/href must come from VI,
      // and item 2 (no translation at that position) keeps its VI copy.
      menu_items_json: JSON.stringify([
        { icon: "X", title: "Lucky money", subtitle: "Sub 1", href: "/wrong" },
      ]),
    });
    const { body } = await getDetail("tet", "en");
    expect(body.campaign).toMatchObject({
      title: "Tet EN",
      summary: "Summary EN",
      body_md: "Body EN",
      cta_label: "See now",
      nav_label: "Tet",
      seo_title: "SEO EN",
      seo_description: "Desc EN",
      nav_badge: "HOT",
      landing_path: "/tet",
    });
    expect(body.campaign.menu_items).toEqual([
      { icon: "🧧", title: "Lucky money", subtitle: "Sub 1", href: "/tet#a" },
      { icon: "🎆", title: "Pháo hoa", subtitle: "Phụ đề 2", href: "/tet#b" },
    ]);
    const listed = (await getList("en")).body.campaigns[0];
    expect(listed.title).toBe("Tet EN");
    expect(listed.menu_items[0].title).toBe("Lucky money");
  });

  test("draft, stale and failed EN rows are not served; zh without a row falls back to VI", async () => {
    const trId = insertTranslation({
      campaign_id: id,
      title: "Tet EN",
      status: "draft",
      menu_items_json: "[]",
    });
    for (const status of ["draft", "stale", "failed"]) {
      sql.query("UPDATE campaign_translations SET status = ? WHERE id = ?").run(status, trId);
      const { body } = await getDetail("tet", "en");
      expect(body.campaign.title).toBe("Tết VI");
      expect(body.available_locales).toEqual(["vi"]);
    }
    const zh = await getDetail("tet", "zh");
    expect(zh.body.campaign.title).toBe("Tết VI");
    expect(zh.body.campaign.menu_items[0].title).toBe("Lì xì");
  });

  test("a NULL translated field falls back to the VI value; a broken translated menu keeps the VI menu", async () => {
    insertTranslation({
      campaign_id: id,
      title: "Tet EN",
      cta_label: null,
      seo_title: null,
      menu_items_json: "not json",
    });
    const { body } = await getDetail("tet", "en");
    expect(body.campaign.title).toBe("Tet EN");
    expect(body.campaign.cta_label).toBe("Xem ngay");
    expect(body.campaign.seo_title).toBe("SEO VI");
    expect(body.campaign.menu_items.map((m: { title: string }) => m.title)).toEqual([
      "Lì xì",
      "Pháo hoa",
    ]);
  });

  test("a ZH translation does not leak into EN and vice versa", async () => {
    insertTranslation({ campaign_id: id, locale: "zh", title: "春节" });
    expect((await getDetail("tet", "en")).body.campaign.title).toBe("Tết VI");
    expect((await getDetail("tet", "zh")).body.campaign.title).toBe("春节");
    expect((await getDetail("tet", "vi")).body.campaign.title).toBe("Tết VI");
  });
});

// ── Public detail ────────────────────────────────────────────────────────────

describe("GET /api/v1/campaigns/:slug", () => {
  test("404 { error: 'Not found' } for draft, archived and unknown slugs", async () => {
    insertCampaign({ slug: "hidden-draft", title: "D", status: "draft" });
    insertCampaign({ slug: "hidden-archived", title: "A", status: "archived" });
    for (const slug of ["hidden-draft", "hidden-archived", "nope"]) {
      expect(await getDetail<ErrorBody>(slug, "vi")).toEqual({
        status: 404,
        body: { error: "Not found" },
      });
    }
  });

  test("400 for an invalid lang even when the slug exists", async () => {
    expect(await getDetail<ErrorBody>("christmas-2026", "de")).toEqual({
      status: 400,
      body: { error: "Invalid lang" },
    });
  });

  test("detail carries exactly the contract keys plus available_locales, and parses strictly", async () => {
    const { status, body } = await getDetail("christmas-2026", "vi");
    expect(status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["available_locales", "campaign"]);
    expect(Object.keys(body.campaign).sort()).toEqual([...CONTRACT_DETAIL_KEYS].sort());
    expect(() =>
      campaignResponseSchema
        .extend({ campaign: campaignResponseSchema.shape.campaign.strict() })
        .strict()
        .parse(body),
    ).not.toThrow();
    expect(body.campaign.body_md).toContain("Mùa lễ 2026");
  });
});

// ── Admin writes ─────────────────────────────────────────────────────────────

describe("admin saves: roles, audit log, cache bump, translation staleness", () => {
  const auditRows = () =>
    sql
      .query(
        "SELECT actor_id, action, entity FROM audit_log WHERE entity = 'campaigns' ORDER BY id",
      )
      .all();
  const xmasId = () =>
    (sql.query("SELECT id FROM campaigns WHERE slug='christmas-2026'").get() as { id: number }).id;

  test("create requires editor, writes one audit row and bumps the CMS revision", async () => {
    const { campaign } = await server.createCampaign({
      slug: "tet-2027",
      title: "Tết 2027",
      status: "draft",
    });
    expect(campaign.slug).toBe("tet-2027");
    expect(sessionRoles).toEqual(["editor"]);
    expect(auditRows()).toEqual([{ actor_id: ACTOR, action: "create", entity: "campaigns" }]);
    expect(kvPuts.filter(([key]) => key === "rev")).toHaveLength(1);
    // Missing locales are queued for the translation cron.
    const job = sql.query("SELECT entity_type, target_locales FROM translation_jobs").get() as {
      entity_type: string;
      target_locales: string;
    };
    expect(job.entity_type).toBe("campaign");
    expect(job.target_locales).toContain("en");
    expect(job.target_locales).toContain("zh");
  });

  test("a duplicate slug is a 409 and writes nothing", async () => {
    await expect(
      server.createCampaign({ slug: "christmas-2026", title: "dup" }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(sql.query("SELECT COUNT(*) n FROM campaigns").get()).toEqual({ n: 1 });
    expect(auditRows()).toEqual([]);
  });

  test("a denied session writes nothing and does not bump the revision", async () => {
    sessionAllows = () => false;
    await expect(server.updateCampaign({ id: xmasId(), title: "Hacked" })).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(server.deleteCampaign(xmasId())).rejects.toMatchObject({ statusCode: 403 });
    expect(sessionRoles).toEqual(["editor", "admin"]);
    expect(sql.query("SELECT title FROM campaigns").get()).toEqual({
      title: "Christmas 2026 Collection",
    });
    expect(auditRows()).toEqual([]);
    expect(kvPuts).toEqual([]);
  });

  test("editing VI copy marks the reviewed EN stale, so EN falls back to the new VI title", async () => {
    await server.updateCampaign({ id: xmasId(), title: "Noel 2026" });
    expect(sessionRoles).toEqual(["editor"]);
    expect(auditRows()).toEqual([{ actor_id: ACTOR, action: "update", entity: "campaigns" }]);
    expect(kvPuts.filter(([key]) => key === "rev")).toHaveLength(1);
    expect(sql.query("SELECT status FROM campaign_translations").get()).toEqual({
      status: "stale",
    });
    expect((await getList("en")).body.campaigns[0].title).toBe("Noel 2026");
  });

  test("editing only non-translated fields keeps the EN translation reviewed", async () => {
    await server.updateCampaign({ id: xmasId(), position: 3, nav_featured: 0 });
    expect(sql.query("SELECT status FROM campaign_translations").get()).toEqual({
      status: "reviewed",
    });
    const xmas = (await getList("en")).body.campaigns[0];
    expect(xmas.position).toBe(3);
    expect(xmas.nav_featured).toBe(false);
  });

  test("delete requires admin and removes the translations with the campaign", async () => {
    await server.deleteCampaign(xmasId());
    expect(sessionRoles).toEqual(["admin"]);
    expect(sql.query("SELECT COUNT(*) n FROM campaign_translations").get()).toEqual({ n: 0 });
    expect(auditRows()).toEqual([{ actor_id: ACTOR, action: "delete", entity: "campaigns" }]);
    expect((await getDetail("christmas-2026", "vi")).status).toBe(404);
  });
});

// ── Server-function input validation (landing_path / href rule) ──────────────

describe("save validation for landing_path and menu hrefs", () => {
  const validateUpdate = (data: Record<string, unknown>) =>
    actions.updateCampaignFn.validator({ id: 1, ...data });

  test("accepts internal paths without a lang prefix, https URLs and null", () => {
    for (const landing_path of [
      "/christmas",
      "/catalog/christmas",
      "/christmas#hot",
      "https://shop.example.com/x",
      null,
    ]) {
      expect(validateUpdate({ landing_path }).landing_path).toBe(landing_path);
    }
  });

  test("rejects lang-prefixed, http, protocol-relative and relative landing paths", () => {
    for (const landing_path of [
      "/vi/christmas",
      "/en",
      "/zh#x",
      "http://shop.example.com",
      "//evil.com",
      "christmas",
      "javascript:alert(1)",
    ]) {
      expect(() => validateUpdate({ landing_path })).toThrow();
    }
  });

  test("menu hrefs follow the same rule; menu_items are stored as menu_items_json", () => {
    const item = { icon: "🎁", title: "A", subtitle: "", href: "/catalog/christmas" };
    const ok = validateUpdate({ menu_items: [item] });
    expect(ok).not.toHaveProperty("menu_items");
    expect(JSON.parse(ok.menu_items_json as string)).toEqual([{ ...item, subtitle: null }]);
    expect(() => validateUpdate({ menu_items: [{ ...item, href: "/en/catalog" }] })).toThrow();
    expect(() => validateUpdate({ menu_items: [{ ...item, href: "http://x.com" }] })).toThrow();
  });

  test("toggles are stored as 0/1 and dates must be ISO YYYY-MM-DD", () => {
    expect(validateUpdate({ nav_featured: true, home_featured: false })).toMatchObject({
      nav_featured: 1,
      home_featured: 0,
    });
    expect(() => validateUpdate({ end_date: "25/12/2026" })).toThrow();
    expect(validateUpdate({ end_date: "2026-12-25" }).end_date).toBe("2026-12-25");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Business flows. Each test walks one operator/visitor journey through the
// production server functions (validator → handler, as createServerFn runs
// them) and observes the result only through the public routes, SQLite rows
// and the KV boundary. Expected values are written out from contract.md, not
// computed by the code under test.
// ════════════════════════════════════════════════════════════════════════════

const engine = load(
  resolve(sourceRoot, "features/translations/translation-jobs.engine.ts"),
) as typeof import("../translations/translation-jobs.engine");

/** Run a server function the way TanStack Start does: validator, then body. */
const viaFn = <T>(fn: string, input: unknown, body: (data: never) => Promise<T>) =>
  body(actions[fn].validator(input) as never);
const createFn = (input: Record<string, unknown>) =>
  viaFn("createCampaignFn", input, server.createCampaign);
const updateFn = (input: Record<string, unknown>) =>
  viaFn("updateCampaignFn", input, server.updateCampaign);

const slugs = async (lang = "vi") =>
  (await getList(lang)).body.campaigns.map((c: { slug: string }) => c.slug);
const listed = async (slug: string, lang = "vi") =>
  (await getList(lang)).body.campaigns.find((c: { slug: string }) => c.slug === slug);
const campaignAudit = () =>
  sql
    .query("SELECT action FROM audit_log WHERE entity = 'campaigns' ORDER BY id")
    .all()
    .map((row) => (row as { action: string }).action);
/** KV writes per key: "rev" is the public edge-cache revision, the dirty flag
 *  is what makes the cron trigger a landing rebuild (prerendered HTML). */
const kvKeys = () => kvPuts.map(([key]) => key);
const REBUILD_KEY = "landing_rebuild_dirty";

function xmasRowId(): number {
  return (sql.query("SELECT id FROM campaigns WHERE slug='christmas-2026'").get() as { id: number })
    .id;
}

describe("flow: campaign lifecycle from the admin to the public API", () => {
  test("draft → live → toggles → expiry at VN midnight → archived → deleted", async () => {
    // 1. Create as a draft: stored, audited, but invisible to the public API.
    const { campaign } = await createFn({
      slug: "tet-2027",
      title: "Tết 2027",
      status: "draft",
      position: 1,
      start_date: "2027-01-20",
      end_date: "2027-02-20",
      landing_path: "/tet",
      nav_featured: true,
      home_featured: true,
    });
    const id = campaign.id;
    expect(await slugs()).toEqual(["christmas-2026"]);
    expect((await getDetail("tet-2027")).status).toBe(404);

    // 2. Go live: listed after the seed (position 1 > 0), both flags effective.
    await updateFn({ id, status: "live" });
    expect(await slugs()).toEqual(["christmas-2026", "tet-2027"]);
    expect(await listed("tet-2027")).toMatchObject({ nav_featured: true, home_featured: true });
    expect((await getDetail("tet-2027")).status).toBe(200);

    // 3. Operator turns the navbar toggle off; the home toggle stays on.
    await updateFn({ id, nav_featured: false });
    expect(await listed("tet-2027")).toMatchObject({ nav_featured: false, home_featured: true });
    await updateFn({ id, nav_featured: true });

    // 4. end_date 2027-02-20 still counts at 23:59 VN; at 00:00 VN on the 21st
    //    both flags drop with no edit, and the campaign stays listed.
    setVnTime("2027-02-20T23:59:59");
    expect(await listed("tet-2027")).toMatchObject({ nav_featured: true, home_featured: true });
    setVnTime("2027-02-21T00:00:00");
    expect(await listed("tet-2027")).toMatchObject({ nav_featured: false, home_featured: false });
    expect((await getDetail("tet-2027")).status).toBe(200);

    // 5. Archived: gone from the list and the detail is a 404.
    await updateFn({ id, status: "archived" });
    expect(await slugs()).toEqual(["christmas-2026"]);
    expect(await getDetail<ErrorBody>("tet-2027")).toEqual({
      status: 404,
      body: { error: "Not found" },
    });

    // 6. Delete (admin only) removes the row.
    await server.deleteCampaign(id);
    expect(sql.query("SELECT COUNT(*) n FROM campaigns WHERE slug = 'tet-2027'").get()).toEqual({
      n: 0,
    });

    // Every save was role-checked, audited and made both the edge cache and
    // the prerendered landing stale: 1 create + 4 updates + 1 delete.
    expect(sessionRoles).toEqual(["editor", "editor", "editor", "editor", "editor", "admin"]);
    expect(campaignAudit()).toEqual(["create", "update", "update", "update", "update", "delete"]);
    expect(kvKeys().filter((key) => key === "rev")).toHaveLength(6);
    expect(kvKeys().filter((key) => key === REBUILD_KEY)).toHaveLength(6);
  });

  test("changing position reorders the public list; ties fall back to the newest start_date", async () => {
    const a = (await createFn({ slug: "a-sale", title: "A", status: "live", position: 2 }))
      .campaign;
    const b = (
      await createFn({
        slug: "b-sale",
        title: "B",
        status: "live",
        position: 2,
        start_date: "2026-11-01",
      })
    ).campaign;
    // Seed is position 0; a/b tie at 2 and b has the later start_date
    // (a has none, which sorts last under DESC).
    expect(await slugs()).toEqual(["christmas-2026", "b-sale", "a-sale"]);
    await updateFn({ id: a.id, position: 0 });
    await updateFn({ id: b.id, position: 1 });
    await updateFn({ id: xmasRowId(), position: 5 });
    expect(await slugs()).toEqual(["a-sale", "b-sale", "christmas-2026"]);
    expect(await slugs("en")).toEqual(["a-sale", "b-sale", "christmas-2026"]);
    expect((await listed("christmas-2026"))?.position).toBe(5);
  });

  test("the slug is fixed after creation: an edit cannot rename it, so links and translations stay attached", async () => {
    // Actual rule: the update validator has no slug field (zod strips it) and
    // the service's writable column list excludes it. Renaming means creating
    // a new campaign; the old /campaigns/:slug URL and its translations stay.
    const parsed = actions.updateCampaignFn.validator({ id: xmasRowId(), slug: "noel-2026" });
    expect(parsed).not.toHaveProperty("slug");
    await server.updateCampaign({ id: xmasRowId(), slug: "noel-2026" } as never);
    expect(sql.query("SELECT slug FROM campaigns").all()).toEqual([{ slug: "christmas-2026" }]);
    expect((await getDetail("noel-2026", "en")).status).toBe(404);
    const detail = await getDetail("christmas-2026", "en");
    expect(detail.body.available_locales).toEqual(["vi", "en"]);
    expect(detail.body.campaign.cta_label).toBe("Explore Collection");
  });

  test("a viewer cannot save and an editor cannot delete; nothing is written either way", async () => {
    sessionAllows = (role) => role === "viewer";
    await expect(createFn({ slug: "x-1", title: "X" })).rejects.toMatchObject({ statusCode: 403 });
    sessionAllows = (role) => role !== "admin";
    await expect(server.deleteCampaign(xmasRowId())).rejects.toMatchObject({ statusCode: 403 });
    expect(await slugs()).toEqual(["christmas-2026"]);
    expect(campaignAudit()).toEqual([]);
    expect(kvPuts).toEqual([]);
  });
});

// ── Translation lifecycle with the real job engine ───────────────────────────
// The model is the only fake: it answers chat/completions the way the prompt
// asks ({ "<locale>": { ...same keys } }), tagging every line with the locale
// and deliberately returning a wrong icon/href in the menu, which the public
// reader must ignore.

let aiCalls: string[] = [];
function installFakeModel(failLocales: string[] = []) {
  aiCalls = [];
  const tag = (value: string, locale: string) =>
    value
      .split("\n")
      .map((line) => (line.trim() ? `${line} [${locale}]` : line))
      .join("\n");
  networkStub = async (url, init) => {
    if (!url.endsWith("/chat/completions")) return refuseNetwork(url);
    const request = JSON.parse(String(init?.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    const prompt = request.messages.find((m) => m.role === "user")!.content;
    const locale = /row to (en|zh):/.exec(prompt)![1];
    aiCalls.push(locale);
    const reply = (content: string) =>
      new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    if (failLocales.includes(locale)) return reply("Sorry, I cannot translate this.");
    const { vi } = JSON.parse(prompt.slice(prompt.indexOf("{"))) as {
      vi: Record<string, string>;
    };
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(vi)) {
      out[key] =
        key === "menu_items_json"
          ? JSON.stringify(
              (JSON.parse(value) as Array<Record<string, string | null>>).map((item) => ({
                ...item,
                icon: "?",
                href: "/model-made-this-up",
                title: `${item.title} [${locale}]`,
                subtitle: item.subtitle ? `${item.subtitle} [${locale}]` : item.subtitle,
              })),
            )
          : tag(value, locale);
    }
    return reply(JSON.stringify({ [locale]: out }));
  };
}

describe("flow: translation lifecycle (VI save → AI drafts → review → served → stale)", () => {
  const TET_MENU = [
    { icon: "🧧", title: "Lì xì", subtitle: "Quà đầu năm", href: "/tet#li-xi" },
    { icon: "🎆", title: "Pháo hoa", subtitle: null, href: "/catalog/fireworks" },
    {
      icon: "🏮",
      title: "Đèn lồng",
      subtitle: "Trang trí",
      href: "https://hub.thgfulfill.com/lantern",
    },
  ];
  const trRow = (locale: string) =>
    sql
      .query(
        "SELECT t.id, t.status FROM campaign_translations t JOIN campaigns c ON c.id = t.campaign_id WHERE c.slug = 'tet-2027' AND t.locale = ?",
      )
      .get(locale) as { id: number; status: string } | null;

  test("drafts are never served; an approved EN is served with VI icons/hrefs; a failed ZH falls back to VI", async () => {
    installFakeModel(["zh"]);
    const { campaign } = await createFn({
      slug: "tet-2027",
      title: "Tết 2027",
      summary: "Lì xì đầu năm",
      body_md: "## Ưu đãi Tết\n\n- Giảm phí fulfill\n- Giao nhanh",
      cta_label: "Xem ưu đãi",
      nav_label: "Tết",
      nav_badge: "HOT",
      status: "live",
      landing_path: "/tet",
      nav_featured: true,
      menu_items: TET_MENU,
      seo_title: "Tết 2027 | TH Group",
      seo_description: "Ưu đãi mùa Tết",
    });

    // The VI save queued one job for both missing locales.
    expect(
      sql.query("SELECT entity_type, entity_ref, target_locales FROM translation_jobs").all(),
    ).toEqual([
      { entity_type: "campaign", entity_ref: String(campaign.id), target_locales: '["en","zh"]' },
    ]);

    // The cron pass translates: EN lands as a draft, ZH as failed (bad JSON).
    await engine.runOnePass({ OPENAI_API_KEY: "test-key" });
    expect(aiCalls.sort()).toEqual(["en", "zh", "zh"]); // zh: one JSON-recovery retry
    expect(trRow("en")?.status).toBe("draft");
    expect(trRow("zh")?.status).toBe("failed");

    // A draft is not served: EN still reads VI and only VI is available.
    let en = await getDetail("tet-2027", "en");
    expect(en.body.campaign.title).toBe("Tết 2027");
    expect(en.body.available_locales).toEqual(["vi"]);

    // An editor approves EN.
    kvPuts = [];
    sessionRoles = [];
    await server.approveCampaignTranslation(trRow("en")!.id);
    expect(sessionRoles).toEqual(["editor"]);
    expect(kvKeys()).toEqual(["rev", REBUILD_KEY]);

    en = await getDetail("tet-2027", "en");
    expect(en.body.available_locales).toEqual(["vi", "en"]);
    expect(en.body.campaign).toMatchObject({
      title: "Tết 2027 [en]",
      summary: "Lì xì đầu năm [en]",
      body_md: "## Ưu đãi Tết [en]\n\n- Giảm phí fulfill [en]\n- Giao nhanh [en]",
      cta_label: "Xem ưu đãi [en]",
      nav_label: "Tết [en]",
      seo_title: "Tết 2027 | TH Group [en]",
      seo_description: "Ưu đãi mùa Tết [en]",
      // Not translated: straight from the VI row.
      nav_badge: "HOT",
      landing_path: "/tet",
      nav_featured: true,
    });
    expect(en.body.campaign.menu_items).toEqual([
      { icon: "🧧", title: "Lì xì [en]", subtitle: "Quà đầu năm [en]", href: "/tet#li-xi" },
      { icon: "🎆", title: "Pháo hoa [en]", subtitle: null, href: "/catalog/fireworks" },
      {
        icon: "🏮",
        title: "Đèn lồng [en]",
        subtitle: "Trang trí [en]",
        href: "https://hub.thgfulfill.com/lantern",
      },
    ]);
    // The list carries the same overlay as the detail.
    expect(await listed("tet-2027", "en")).toMatchObject({
      title: "Tết 2027 [en]",
      cta_label: "Xem ưu đãi [en]",
    });

    // ZH failed → VI copy.
    const zh = await getDetail("tet-2027", "zh");
    expect(zh.body.campaign.title).toBe("Tết 2027");
    expect(zh.body.campaign.menu_items.map((m: { title: string }) => m.title)).toEqual([
      "Lì xì",
      "Pháo hoa",
      "Đèn lồng",
    ]);
  });

  test("a non-translated edit keeps EN reviewed and served; a VI copy edit makes EN stale and serves VI", async () => {
    installFakeModel();
    const { campaign } = await createFn({
      slug: "tet-2027",
      title: "Tết 2027",
      cta_label: "Xem ưu đãi",
      status: "live",
      menu_items: TET_MENU,
    });
    await engine.runOnePass({ OPENAI_API_KEY: "test-key" });
    await server.approveCampaignTranslation(trRow("en")!.id);

    // Non-translated fields only: position, badge, dates, toggles, landing.
    await updateFn({
      id: campaign.id,
      position: 4,
      nav_badge: "SALE",
      end_date: "2027-02-28",
      home_featured: true,
      landing_path: "/tet-sale",
    });
    expect(trRow("en")?.status).toBe("reviewed");
    expect(await listed("tet-2027", "en")).toMatchObject({
      title: "Tết 2027 [en]",
      nav_badge: "SALE",
      position: 4,
      landing_path: "/tet-sale",
      home_featured: true,
    });

    // Changing a menu item's VI title is a copy edit too.
    await updateFn({
      id: campaign.id,
      menu_items: [{ ...TET_MENU[0], title: "Lì xì may mắn" }, ...TET_MENU.slice(1)],
    });
    expect(trRow("en")?.status).toBe("stale");
    expect(trRow("zh")?.status).toBe("stale");
    const en = await getDetail("tet-2027", "en");
    expect(en.body.available_locales).toEqual(["vi"]);
    expect(en.body.campaign.title).toBe("Tết 2027");
    expect(en.body.campaign.menu_items[0].title).toBe("Lì xì may mắn");
  });

  test("a reviewer's menu edit is unpublished until re-approved; extra items are dropped, missing ones keep VI", async () => {
    installFakeModel();
    await createFn({ slug: "tet-2027", title: "Tết 2027", status: "live", menu_items: TET_MENU });
    await engine.runOnePass({ OPENAI_API_KEY: "test-key" });
    const enId = trRow("en")!.id;
    await server.approveCampaignTranslation(enId);

    const fields = sql
      .query(
        "SELECT title, summary, body_md, cta_label, nav_label, seo_title, seo_description FROM campaign_translations WHERE id = ?",
      )
      .get(enId) as Record<string, string | null>;
    const menu = (titles: string[]) =>
      JSON.stringify(titles.map((title) => ({ icon: "", title, subtitle: null, href: "/x" })));
    const edit = (titles: string[]) =>
      server.editCampaignTranslation({
        id: enId,
        ...fields,
        title: "Tet 2027",
        menu_items_json: menu(titles),
      } as never);

    // Four translated items for a three-item VI menu.
    await edit(["Lucky money", "Fireworks", "Lanterns", "Extra"]);
    expect(trRow("en")?.status).toBe("draft");
    expect((await getDetail("tet-2027", "en")).body.campaign.title).toBe("Tết 2027");

    await server.approveCampaignTranslation(enId);
    let items = (await getDetail("tet-2027", "en")).body.campaign.menu_items;
    expect(items.map((m: { title: string; href: string }) => [m.title, m.href])).toEqual([
      ["Lucky money", "/tet#li-xi"],
      ["Fireworks", "/catalog/fireworks"],
      ["Lanterns", "https://hub.thgfulfill.com/lantern"],
    ]);

    // One translated item: the other two stay Vietnamese, with VI subtitles.
    await edit(["Lucky money"]);
    await server.approveCampaignTranslation(enId);
    items = (await getDetail("tet-2027", "en")).body.campaign.menu_items;
    expect(
      items.map((m: { title: string; subtitle: string | null }) => [m.title, m.subtitle]),
    ).toEqual([
      ["Lucky money", "Quà đầu năm"],
      ["Pháo hoa", null],
      ["Đèn lồng", "Trang trí"],
    ]);
  });
});

// ── Cross-repo golden: the seed as the landing receives it ───────────────────
// __golden__/christmas-2026.golden.json is the CMS ↔ landing oracle. The same
// file lives in THG_landingpage at src/lib/__golden__/ and the landing's
// src/lib/campaigns.golden.test.tsx parses and renders it. If this test fails,
// the CMS response changed shape or content:
//   1. Decide whether the change is intended (contract.md is the authority).
//   2. Refresh:  UPDATE_GOLDEN=1 bun test src/features/campaigns/campaigns.integration.test.ts
//   3. Copy the file byte-for-byte to THG_landingpage src/lib/__golden__/ and
//      run its `bun run test`; a failure there is real CMS ↔ landing drift.
// The clock is pinned (2026-10-24 10:00 VN) and updated_at is normalised, so
// the file only changes when the response does.

describe("golden: christmas-2026 list and detail, vi and en", () => {
  const GOLDEN = resolve(directory, "__golden__/christmas-2026.golden.json");
  const UPDATED_AT = 1793000000;

  test("the real route output equals the shared golden file", async () => {
    setVnTime("2026-10-24T10:00:00");
    sql.query("UPDATE campaigns SET updated_at = ?").run(UPDATED_AT);
    const actual = {
      list: { vi: (await getList("vi")).body, en: (await getList("en")).body },
      detail: {
        vi: (await getDetail("christmas-2026", "vi")).body,
        en: (await getDetail("christmas-2026", "en")).body,
      },
    };
    if (process.env.UPDATE_GOLDEN === "1") {
      const comment =
        "Generated by CMS_management- src/features/campaigns/campaigns.integration.test.ts with UPDATE_GOLDEN=1. An identical copy lives in THG_landingpage src/lib/__golden__/. Do not edit by hand.";
      writeFileSync(GOLDEN, `${JSON.stringify({ $comment: comment, ...actual }, null, 2)}\n`);
    }
    const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as Record<string, unknown>;
    expect({ list: golden.list, detail: golden.detail }).toEqual(actual);
  });
});
