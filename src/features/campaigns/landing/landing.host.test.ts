import { describe, expect, test } from "bun:test";

import {
  dispatchByHost,
  handleLandingRequest,
  isLandingHost,
  landingObjectKey,
  type LandingHostDeps,
} from "./landing.host";
import { cacheControlFor, contentTypeFor, isHashedAssetName } from "./landing.mime";

const LP = "lp.thgfulfill.com";
const LIVE = "a".repeat(32);
const DRAFT = "b".repeat(32);

const objects = new Map<string, string>([
  [landingObjectKey("christmas-2026", LIVE, "index.html"), "<html>live</html>"],
  [landingObjectKey("christmas-2026", LIVE, "assets/hero.jpg"), "JPEG"],
  [landingObjectKey("christmas-2026", LIVE, "assets/app.3f9a1c2b.js"), "js"],
  [landingObjectKey("christmas-2026", LIVE, "assets/Ảnh 1.png"), "PNG"],
  [landingObjectKey("christmas-2026", DRAFT, "index.html"), "<html>draft</html>"],
]);

const deps: LandingHostDeps = {
  resolveLive: async (slug) => (slug === "christmas-2026" ? LIVE : null),
  resolvePreview: async (id) => (id === DRAFT || id === LIVE ? "christmas-2026" : null),
  getObject: async (key, headOnly) => {
    const body = objects.get(key);
    if (body === undefined) return null;
    return { body: headOnly ? null : body, etag: `"${key.length}"`, size: body.length };
  },
  leadScript: () => "window.__THG_LEAD__={};/*thg-lead*/",
};

const lp = (path: string, init: RequestInit = {}) =>
  handleLandingRequest(new Request(`https://${LP}${path}`, init), deps);

describe("host routing", () => {
  const cmsCalls: string[] = [];
  const route = (url: string, headers: Record<string, string> = {}, method = "GET") =>
    dispatchByHost(
      new Request(url, { headers, method }),
      LP,
      (req) => handleLandingRequest(req, deps),
      async (req) => {
        cmsCalls.push(new URL(req.url).pathname);
        return new Response("cms", { status: 200 });
      },
    );

  test("the lp host never reaches the CMS handler: admin, api, auth, server fns all 404", async () => {
    cmsCalls.length = 0;
    for (const path of [
      "/",
      "/admin",
      "/admin/content/campaigns/christmas-2026",
      "/api/v1/leads",
      "/api/v1/campaigns",
      "/api/v1/media/upload",
      "/api/auth/google/start",
      "/api/auth/google/callback?code=x",
      "/login",
      "/_serverFn/abc",
      "/_build/assets/app.js",
    ]) {
      const res = await route(`https://${LP}${path}`);
      expect(res.status).toBe(404);
      expect(res.headers.get("set-cookie")).toBeNull();
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    }
    const post = await route(`https://${LP}/api/v1/leads`, {}, "POST");
    expect(post.status).toBe(404);
    expect(cmsCalls).toEqual([]);
  });

  test("a Host header naming the lp host is enough to take the restrictive path", async () => {
    cmsCalls.length = 0;
    const res = await route("http://127.0.0.1:8787/admin", { host: "lp.thgfulfill.com:8787" });
    expect(res.status).toBe(404);
    expect(cmsCalls).toEqual([]);
    expect(isLandingHost(new Request("https://LP.THGFULFILL.COM/x"), LP)).toBe(true);
  });

  test("the cms host is unaffected", async () => {
    cmsCalls.length = 0;
    for (const path of ["/admin", "/api/v1/leads", "/christmas-2026/", "/_thg/thg-lead.js"]) {
      const res = await route(`https://cms.thgfulfill.com${path}`);
      expect(await res.text()).toBe("cms");
    }
    expect(cmsCalls).toEqual(["/admin", "/api/v1/leads", "/christmas-2026/", "/_thg/thg-lead.js"]);
  });
});

describe("landing host responses", () => {
  test("serves the published index with html type, nosniff, referrer policy and short cache", async () => {
    const res = await lp("/christmas-2026/");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<html>live</html>");
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
    expect(res.headers.get("x-robots-tag")).toBeNull();
  });

  test("redirects the bare slug to the trailing-slash URL so relative assets resolve", async () => {
    const res = await lp("/christmas-2026?utm_source=fb");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/christmas-2026/?utm_source=fb");
  });

  test("assets get their own content type; fingerprinted names are immutable", async () => {
    const hero = await lp("/christmas-2026/assets/hero.jpg");
    expect(hero.headers.get("content-type")).toBe("image/jpeg");
    expect(hero.headers.get("cache-control")).toBe("public, max-age=3600");
    const app = await lp("/christmas-2026/assets/app.3f9a1c2b.js");
    expect(app.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(app.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    const unicode = await lp(`/christmas-2026/assets/${encodeURIComponent("Ảnh 1.png")}`);
    expect(unicode.status).toBe(200);
    expect(unicode.headers.get("content-type")).toBe("image/png");
  });

  test("previews serve any version by its unguessable id, with noindex", async () => {
    const res = await lp(`/_preview/${DRAFT}/`);
    expect(await res.text()).toBe("<html>draft</html>");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(res.headers.get("cache-control")).toBe("private, no-cache");
    expect((await lp(`/_preview/${"c".repeat(32)}/`)).status).toBe(404);
    expect((await lp("/_preview/not-a-version-id/")).status).toBe(404);
  });

  test("unknown slugs, missing files and traversal attempts are 404", async () => {
    expect((await lp("/other-campaign/")).status).toBe(404);
    expect((await lp("/christmas-2026/assets/missing.png")).status).toBe(404);
    expect((await lp("/christmas-2026/%2e%2e/%2e%2e/secret")).status).toBe(404);
    expect((await lp("/christmas-2026/assets%2f..%2f..%2fx")).status).toBe(404);
    expect((await lp("/christmas-2026/a%5cb")).status).toBe(404);
  });

  test("only GET and HEAD are answered; HEAD has headers and no body", async () => {
    expect((await lp("/christmas-2026/", { method: "POST" })).status).toBe(404);
    expect((await lp("/christmas-2026/", { method: "PUT" })).status).toBe(404);
    const head = await lp("/christmas-2026/assets/hero.jpg", { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("content-length")).toBe("4");
    expect(await head.text()).toBe("");
  });

  test("answers 304 for a matching ETag", async () => {
    const first = await lp("/christmas-2026/assets/hero.jpg");
    const etag = first.headers.get("etag") ?? "";
    const again = await lp("/christmas-2026/assets/hero.jpg", {
      headers: { "if-none-match": etag },
    });
    expect(again.status).toBe(304);
  });

  test("serves the shared lead script and robots.txt", async () => {
    const script = await lp("/_thg/thg-lead.js");
    expect(script.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(await script.text()).toContain("/*thg-lead*/");
    const robots = await (await lp("/robots.txt")).text();
    expect(robots).toContain("Disallow: /_preview/");
  });
});

describe("content types and cache policy", () => {
  test("maps every allow-listed extension", () => {
    expect(contentTypeFor("a.CSS")).toBe("text/css; charset=utf-8");
    expect(contentTypeFor("f/x.woff2")).toBe("font/woff2");
    expect(contentTypeFor("v.webm")).toBe("video/webm");
    expect(contentTypeFor("i.svg")).toBe("image/svg+xml");
    expect(contentTypeFor("i.avif")).toBe("image/avif");
    expect(contentTypeFor("data.json")).toBe("application/json; charset=utf-8");
    expect(contentTypeFor("noext")).toBe("application/octet-stream");
  });

  test("recognises build fingerprints but not long plain words", () => {
    expect(isHashedAssetName("assets/index-B7HeRaw1.js")).toBe(true);
    expect(isHashedAssetName("main.3f9a1c2b.css")).toBe(true);
    expect(isHashedAssetName("christmas-collection.jpg")).toBe(false);
    expect(isHashedAssetName("hero-christmas-market-navy.jpg")).toBe(false);
    expect(cacheControlFor("index.html", "preview")).toBe("private, no-cache");
    expect(cacheControlFor("a.png", "preview")).toBe("private, max-age=86400");
  });
});
