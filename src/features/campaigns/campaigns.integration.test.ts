// Campaigns against real SQLite semantics: the full migration chain (0001 → 0062),
// the public route handlers, the service SQL (live filter, ordering, reviewed-
// translation overlay) and the admin write path (roles, audit, cache bump,
// translation staleness). Oracle: runs/xmas-campaigns-20261024/contract.md.
//
// Same isolation approach as blog-event.integrity.test.ts: production modules
// are transpiled and run in a VM context whose only stubs are the Worker
// boundaries (D1 client → bun:sqlite adapter, cloudflare:workers env, session
// auth, router factories). The VM's `Date` is pinned so "today in
// Asia/Ho_Chi_Minh" is controlled without touching production code.

import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
let kvPuts: Array<[string, string]> = [];
let sessionRoles: string[] = [];
let sessionAllows: (role: string) => boolean = () => true;
const ACTOR = 9;

const boundaries: Record<string, unknown> = {
  "@/core/db/client": { getDb: () => db, nowSeconds: () => Math.floor(nowMs / 1000) },
  "cloudflare:workers": {
    env: { CMS_REV: { put: async (key: string, value: string) => void kvPuts.push([key, value]) } },
  },
  "@/features/careers/landing-rebuild": { markLandingRebuildNeeded: async () => {} },
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
      __importMeta: { env: { PROD: false } },
      fetch: () => {
        throw new Error("Network call from a campaign code path");
      },
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
