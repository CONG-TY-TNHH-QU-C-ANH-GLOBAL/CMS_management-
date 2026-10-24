// lp.thgfulfill.com isolation at the Worker fetch-handler level: the REAL src/server.ts entry,
// the real landing host + its D1/R2 bindings (landing.host.server.ts), real SQLite with the
// full migration chain, an in-memory R2 that records every key read, and a recorder standing
// in for the TanStack Start app (admin, /api, auth, server functions).
//
// Oracle: the security boundary in landing.host.ts's header and the owner's rule that
// uploaded HTML must never reach CMS/site sessions or admin capabilities. Concretely:
//   - on the landing host the CMS app is NEVER invoked, for any path or method;
//   - only published versions are reachable at /<slug>/, any non-failed version by its
//     32-hex id at /_preview/<id>/;
//   - no request can read an R2 key outside landings/<slug>/<version>/site/.

import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { Database as SqliteDatabase } from "bun:sqlite";

import {
  createLoader,
  d1,
  memoryR2,
  migratedSnapshot,
  srcPath,
} from "./__fixtures__/worker-harness";

const LP = "https://lp.thgfulfill.com";
const CMS = "https://cms.thgfulfill.com";
const SLUG = "christmas-2026";
const LIVE = "1".repeat(32);
const DRAFT = "2".repeat(32);
const FAILED = "3".repeat(32);
const PROCESSING = "4".repeat(32);
const site = (version: string, path: string) => `landings/${SLUG}/${version}/site/${path}`;

let sql: Database;
let snapshot: Uint8Array;
let r2 = memoryR2();
let cmsCalls: { url: string; method: string; host: string | null }[] = [];
let dbBroken = false;

const realDb = d1(() => sql);
const env = () => ({
  DB: dbBroken
    ? ({
        prepare() {
          throw new Error("D1 unavailable");
        },
      } as unknown as D1Database)
    : realDb,
  MEDIA: r2.bucket,
  BASE_URL: CMS,
  TURNSTILE_SITE_KEY: "",
});

const loader = createLoader({
  "cloudflare:workers": { DurableObject: class {}, env: {} },
  "@tanstack/react-start/server-entry": {
    __esModule: true,
    default: {
      fetch: async (request: Request) => {
        cmsCalls.push({
          url: request.url,
          method: request.method,
          host: request.headers.get("host"),
        });
        return new Response("CMS APP", { status: 200, headers: { "set-cookie": "thg_sid=x" } });
      },
    },
  },
});
const worker = loader.load<{
  default: { fetch(request: Request, env: unknown, ctx: unknown): Promise<Response> };
}>(srcPath("server")).default;

const fetchWorker = (url: string, init: RequestInit = {}) =>
  worker.fetch(new Request(url, init), env(), {});

beforeAll(() => {
  snapshot = migratedSnapshot();
});
beforeEach(() => {
  sql = SqliteDatabase.deserialize(snapshot);
  r2 = memoryR2();
  cmsCalls = [];
  dbBroken = false;
  const campaign = sql.query(`SELECT id FROM campaigns WHERE slug = ?`).get(SLUG) as { id: number };
  const insert = sql.query(
    `INSERT INTO campaign_landing_versions (id, campaign_id, slug, status) VALUES (?, ?, ?, ?)`,
  );
  insert.run(LIVE, campaign.id, SLUG, "ready");
  insert.run(DRAFT, campaign.id, SLUG, "ready");
  insert.run(FAILED, campaign.id, SLUG, "failed");
  insert.run(PROCESSING, campaign.id, SLUG, "processing");
  sql.query(`UPDATE campaigns SET landing_version_id = ? WHERE id = ?`).run(LIVE, campaign.id);
  const files: [string, string][] = [
    [site(LIVE, "index.html"), "<html>LIVE</html>"],
    [site(LIVE, "assets/hero.jpg"), "JPEG"],
    [site(LIVE, "assets/page.html"), "<p>second page</p>"],
    [
      site(LIVE, "assets/logo.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    ],
    [site(LIVE, "%2e%2e/x.jpg"), "literal percent name"],
    [site(DRAFT, "index.html"), "<html>DRAFT</html>"],
    [site(FAILED, "index.html"), "<html>FAILED</html>"],
    [site(PROCESSING, "index.html"), "<html>PROCESSING</html>"],
    [`landings/${SLUG}/${LIVE}/source/index.html`, "<html>SOURCE</html>"],
    ["landings/secret.txt", "SECRET"],
    ["media/private.pdf", "PRIVATE"],
  ];
  for (const [key, body] of files) void r2.bucket.put(key, new TextEncoder().encode(body));
});

/** Every lp response: never the CMS, never a cookie, never CORS, always nosniff. */
function expectLandingResponse(res: Response) {
  expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  expect(res.headers.get("set-cookie")).toBeNull();
  expect(res.headers.get("access-control-allow-origin")).toBeNull();
}

const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

describe("lp host: nothing but landing files", () => {
  const NON_LANDING = [
    "/",
    "/admin",
    "/admin/",
    "/admin/content/campaigns/christmas-2026",
    "/ADMIN",
    "/Admin/content",
    "/%61dmin",
    "/%41DMIN/",
    "/./admin",
    "//admin",
    "///admin/x",
    "/admin/../admin",
    "/x/../admin",
    "/%2e/admin",
    "/%2e%2e/admin",
    "/api",
    "/api/v1/leads",
    "/api/v1/campaigns",
    "/API/v1/leads",
    "/api/v1/landing-uploads",
    "/api/v1/media/upload",
    "/api/auth/google/start",
    "/api/auth/google/callback?code=x&state=y",
    "/_serverFn",
    "/_serverFn/landing_publish",
    "/_build/assets/app.js",
    "/assets/app.js",
    "/login",
    "/logout",
    "/favicon.ico",
    "/.well-known/security.txt",
    `/${SLUG.toUpperCase()}/`,
    "/other-campaign/",
  ];

  test("every non-landing path is a 404 for every method, and the CMS app never runs", async () => {
    for (const path of NON_LANDING) {
      for (const method of METHODS) {
        const res = await fetchWorker(`${LP}${path}`, { method });
        expect({ path, method, status: res.status }).toEqual({ path, method, status: 404 });
        expectLandingResponse(res);
        expect(await res.text()).not.toContain("CMS APP");
      }
    }
    expect(cmsCalls).toEqual([]);
  });

  test("landing paths answer GET and HEAD only; other methods are 404 without touching R2", async () => {
    for (const path of [`/${SLUG}/`, `/_preview/${DRAFT}/`, "/_thg/thg-lead.js", "/robots.txt"]) {
      for (const method of METHODS.filter((m) => m !== "GET" && m !== "HEAD")) {
        const res = await fetchWorker(`${LP}${path}`, {
          method,
          body: method === "OPTIONS" ? undefined : "x",
        });
        expect({ path, method, status: res.status }).toEqual({ path, method, status: 404 });
      }
    }
    expect(r2.gets).toEqual([]);
    expect(cmsCalls).toEqual([]);
  });

  test("Host header and URL host disagreeing: either one naming lp takes the restrictive path", async () => {
    // Attacker talks to cms but claims Host: lp → only landing files.
    const viaHeader = await fetchWorker(`${CMS}/admin`, { headers: { host: "lp.thgfulfill.com" } });
    expect(viaHeader.status).toBe(404);
    const landingViaHeader = await fetchWorker(`${CMS}/${SLUG}/`, {
      headers: { host: "LP.thgfulfill.com:443" },
    });
    expect(await landingViaHeader.text()).toBe("<html>LIVE</html>");
    // Host names are case-insensitive in the URL too.
    expect((await fetchWorker("https://LP.THGFULFILL.COM/admin")).status).toBe(404);
    // The fully qualified form with a trailing dot is the same host (URL and Host header).
    expect((await fetchWorker("https://lp.thgfulfill.com./admin")).status).toBe(404);
    expect(
      (await fetchWorker(`${CMS}/admin`, { headers: { host: "LP.thgfulfill.com.:443" } })).status,
    ).toBe(404);
    expect(await (await fetchWorker(`https://lp.thgfulfill.com./${SLUG}/`)).text()).toBe(
      "<html>LIVE</html>",
    );
    // On lp claiming Host: cms → admin stays unreachable.
    for (const path of ["/admin", "/api/v1/leads", "/_serverFn/x"]) {
      const res = await fetchWorker(`${LP}${path}`, { headers: { host: "cms.thgfulfill.com" } });
      expect(res.status).toBe(404);
    }
    expect(cmsCalls).toEqual([]);
  });

  test("the cms host still reaches the CMS app (no landing files there)", async () => {
    const res = await fetchWorker(`${CMS}/${SLUG}/`);
    expect(await res.text()).toBe("CMS APP");
    expect(cmsCalls.map((c) => new URL(c.url).pathname)).toEqual([`/${SLUG}/`]);
    expect(r2.gets).toEqual([]);
  });

  test("a broken landing binding fails closed with 503, never falls through to the CMS", async () => {
    dbBroken = true;
    const res = await fetchWorker(`${LP}/${SLUG}/`);
    expect(res.status).toBe(503);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(cmsCalls).toEqual([]);
  });
});

describe("lp host: versions", () => {
  test("/<slug>/ serves only the PUBLISHED version; drafts are invisible there", async () => {
    expect(await (await fetchWorker(`${LP}/${SLUG}/`)).text()).toBe("<html>LIVE</html>");
    // A draft id under the live slug is just a (missing) file path inside the live version.
    expect((await fetchWorker(`${LP}/${SLUG}/${DRAFT}/index.html`)).status).toBe(404);
    expect((await fetchWorker(`${LP}/${SLUG}/assets/missing.png`)).status).toBe(404);
    sql.query(`UPDATE campaigns SET landing_version_id = NULL`).run();
    expect((await fetchWorker(`${LP}/${SLUG}/`)).status).toBe(404);
  });

  test("previews need a well-formed 32-hex id of a non-failed version", async () => {
    expect(await (await fetchWorker(`${LP}/_preview/${DRAFT}/`)).text()).toBe("<html>DRAFT</html>");
    expect(await (await fetchWorker(`${LP}/_preview/${PROCESSING}/`)).text()).toBe(
      "<html>PROCESSING</html>",
    );
    for (const id of [
      FAILED, // failed versions are not previewable
      "5".repeat(32), // unknown
      DRAFT.toUpperCase().replace(/2/g, "A"), // uppercase hex
      DRAFT.slice(0, 31),
      `${DRAFT}0`,
      `${DRAFT.slice(0, 31)}g`,
      "%32".repeat(32), // percent-encoded digits are not decoded into an id
      SLUG,
      "not-a-version-id",
    ]) {
      const res = await fetchWorker(`${LP}/_preview/${id}/`);
      expect({ id, status: res.status }).toEqual({ id, status: 404 });
    }
    // No file part at all.
    expect((await fetchWorker(`${LP}/_preview/${DRAFT}`)).status).toBe(404);
  });

  test("preview responses are noindex and private; robots.txt disallows them", async () => {
    const res = await fetchWorker(`${LP}/_preview/${DRAFT}/`);
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(res.headers.get("cache-control")).toBe("private, no-cache");
    expect(await (await fetchWorker(`${LP}/robots.txt`)).text()).toContain("Disallow: /_preview/");
  });
});

describe("lp host: served paths never leave the version prefix", () => {
  const ATTEMPTS = [
    "/../secret.txt",
    "/..%2fsecret.txt",
    "/%2e%2e%2fsecret.txt",
    "/%2E%2E/%2E%2E/secret.txt",
    "/%2e%2e/%2e%2e/%2e%2e/secret.txt",
    "/assets/..%2f..%2f..%2fsecret.txt",
    "/assets%2f..%2f..%2findex.html",
    "/..\\..\\secret.txt",
    "/%2e%2e%5c%2e%2e%5csecret.txt",
    "/a%5cb",
    "/%252e%252e%252fsecret.txt",
    "/%00",
    "/index.html%00.jpg",
    "/%",
    "/%E0%A4%A",
    `/../${DRAFT}/site/index.html`,
    `/%2e%2e/${DRAFT}/site/index.html`,
    "/../../../media/private.pdf",
  ];

  test("traversal attempts are 404 and every R2 read stays under the live version's site/", async () => {
    for (const attempt of ATTEMPTS) {
      for (const base of [`/${SLUG}`, `/_preview/${DRAFT}`]) {
        const res = await fetchWorker(`${LP}${base}${attempt}`);
        const body = await res.text();
        expect({ attempt, base, leaked: /SECRET|PRIVATE|SOURCE|FAILED/.test(body) }).toEqual({
          attempt,
          base,
          leaked: false,
        });
        if (res.status === 200) {
          // Only legitimate in-version files may come back (URL normalization can turn
          // "/x/../index.html" into the version's own index).
          expect(["<html>LIVE</html>", "<html>DRAFT</html>", "literal percent name"]).toContain(
            body,
          );
        }
        expectLandingResponse(res);
      }
    }
    for (const key of r2.gets) {
      expect(key).toMatch(new RegExp(`^landings/${SLUG}/(${LIVE}|${DRAFT})/site/`));
      expect(key.split("/")).not.toContain("..");
      expect(key).not.toContain("\\");
      expect(key).not.toContain("\u0000");
    }
    expect(cmsCalls).toEqual([]);
  });

  test("a double-encoded dot-dot is a literal file name inside the version, not a traversal", async () => {
    const res = await fetchWorker(`${LP}/${SLUG}/%252e%252e/x.jpg`);
    expect(await res.text()).toBe("literal percent name");
    expect(r2.gets.at(-1)).toBe(site(LIVE, "%2e%2e/x.jpg"));
  });
});

describe("lp host: response headers", () => {
  test("every file gets an explicit type from its extension, html assets included", async () => {
    const cases: [string, string][] = [
      [`/${SLUG}/`, "text/html; charset=utf-8"],
      [`/${SLUG}/assets/hero.jpg`, "image/jpeg"],
      [`/${SLUG}/assets/page.html`, "text/html; charset=utf-8"],
      [`/${SLUG}/assets/logo.svg`, "image/svg+xml"],
      ["/_thg/thg-lead.js", "text/javascript; charset=utf-8"],
      ["/robots.txt", "text/plain; charset=utf-8"],
      ["/nope/", "text/plain; charset=utf-8"],
    ];
    for (const [path, type] of cases) {
      const res = await fetchWorker(`${LP}${path}`);
      expect({ path, type: res.headers.get("content-type") }).toEqual({ path, type });
      expectLandingResponse(res);
      expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    }
  });

  test("an uploaded SVG with <script> is served as image/svg+xml (scripts run if opened directly)", async () => {
    // Accepted risk, documented: the bundle allow-list admits .svg and the type is a script-
    // capable document type. That is only acceptable because lp is its own origin with no CMS
    // routes, no cookies and no CORS (asserted above) — the same trust level as the uploaded
    // index.html, which runs arbitrary scripts by design.
    const res = await fetchWorker(`${LP}/${SLUG}/assets/logo.svg`);
    expect(res.headers.get("content-type")).toBe("image/svg+xml");
    expect(await res.text()).toContain("<script>");
    expect(res.headers.get("content-security-policy")).toBeNull();
  });

  test("HEAD returns the GET status and headers without a body", async () => {
    for (const path of [
      `/${SLUG}/`,
      `/${SLUG}/assets/hero.jpg`,
      `/_preview/${DRAFT}/`,
      "/_thg/thg-lead.js",
      "/robots.txt",
      "/nope/",
      "/admin",
    ]) {
      const get = await fetchWorker(`${LP}${path}`);
      const head = await fetchWorker(`${LP}${path}`, { method: "HEAD" });
      expect({ path, status: head.status }).toEqual({ path, status: get.status });
      for (const name of ["content-type", "cache-control", "etag", "x-content-type-options"]) {
        expect({ path, name, value: head.headers.get(name) }).toEqual({
          path,
          name,
          value: get.headers.get(name),
        });
      }
      // HEAD carries no body on any status, 404s included.
      expect({ path, body: await head.text() }).toEqual({ path, body: "" });
    }
    const head = await fetchWorker(`${LP}/${SLUG}/assets/hero.jpg`, { method: "HEAD" });
    expect(head.headers.get("content-length")).toBe("4");
  });

  test("the served lead script carries the CMS leads endpoint from BASE_URL", async () => {
    const script = await (await fetchWorker(`${LP}/_thg/thg-lead.js`)).text();
    expect(
      script.startsWith(
        `window.__THG_LEAD__ = {"endpoint":"${CMS}/api/v1/leads","turnstileSiteKey":""};\n`,
      ),
    ).toBe(true);
    expect(script).toContain('source_page: "landing:" + slug');
  });
});
