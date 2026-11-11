import { describe, expect, test } from "bun:test";

import {
  landingPathOnMainSite,
  mainSiteLandingUrl,
  mainSiteOriginOf,
} from "./landing.config";
import { handleLandingRequest, type LandingHostDeps } from "./landing.host";

const LP = "https://lp.thgfulfill.com";
const SITE = "https://thgroupfulfill.com";

describe("main-domain landing flag", () => {
  test("is off unless explicitly 'true'", () => {
    expect(mainSiteOriginOf({})).toBeNull();
    expect(mainSiteOriginOf({ LANDING_ON_MAIN_DOMAIN: "false" })).toBeNull();
    expect(mainSiteOriginOf({ LANDING_ON_MAIN_DOMAIN: "1" })).toBeNull();
    expect(mainSiteOriginOf({ LANDING_ON_MAIN_DOMAIN: " TRUE " })).toBe(SITE);
    expect(mainSiteOriginOf({ LANDING_ON_MAIN_DOMAIN: "true", SITE_ORIGIN: "https://x.test/" })).toBe("https://x.test");
  });

  test("builds the public landing address", () => {
    expect(mainSiteLandingUrl(SITE, "christmas-2026")).toBe(`${SITE}/vi/campaigns/christmas-2026/`);
    expect(mainSiteLandingUrl(SITE, "christmas-2026", "assets/a.jpg")).toBe(`${SITE}/vi/campaigns/christmas-2026/assets/a.jpg`);
  });
});

describe("landingPathOnMainSite", () => {
  test("maps a stored lp URL to the main domain only when the flag is on", () => {
    const stored = `${LP}/christmas-2026/`;
    expect(landingPathOnMainSite(stored, LP, SITE)).toBe(`${SITE}/vi/campaigns/christmas-2026/`);
    expect(landingPathOnMainSite(stored, LP, null)).toBe(stored);
  });

  test("leaves app-internal paths, external URLs, previews and empty values alone", () => {
    for (const value of ["/christmas", "https://hub.thgfulfill.com", `${LP}/_preview/abc/`, `${LP}/`, null]) {
      expect(landingPathOnMainSite(value, LP, SITE)).toBe(value);
    }
  });

  test("keeps a sub-path and does not match a look-alike host", () => {
    expect(landingPathOnMainSite(`${LP}/tet/index.html`, LP, SITE)).toBe(`${SITE}/vi/campaigns/tet/index.html`);
    expect(landingPathOnMainSite("https://lp.thgfulfill.com.evil.test/tet/", LP, SITE)).toBe(
      "https://lp.thgfulfill.com.evil.test/tet/",
    );
  });
});

describe("lp host redirect to the main domain", () => {
  const deps = (mainSiteOrigin: string | null): LandingHostDeps => ({
    resolveLive: async (slug) => (slug === "tet" ? "a".repeat(32) : null),
    resolvePreview: async () => null,
    getObject: async () => ({ body: "<html>tet</html>", etag: '"e"', size: 16 }),
    leadScript: () => "",
    mainSiteOrigin,
  });
  const call = (path: string, headers: Record<string, string> = {}, d = deps(SITE)) =>
    handleLandingRequest(new Request(`${LP}${path}`, { headers }), d);

  test("a direct visit moves to the same page on the main domain, keeping path and query", async () => {
    const res = await call("/tet/assets/a.jpg?x=1");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(`${SITE}/vi/campaigns/tet/assets/a.jpg?x=1`);
    const bare = await call("/tet");
    expect(bare.headers.get("location")).toBe(`${SITE}/vi/campaigns/tet/`);
  });

  test("a request proxied by the main-domain nginx is served, never redirected back (no loop)", async () => {
    const res = await call("/tet/", { "x-thg-via": "main-site" });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<html>tet</html>");
  });

  test("a slug without a published landing is still a plain 404, even with the flag on", async () => {
    expect((await call("/nope/")).status).toBe(404);
  });

  test("with the flag off the host behaves as before", async () => {
    const res = await call("/tet/", {}, deps(null));
    expect(res.status).toBe(200);
    const slashless = await call("/tet", {}, deps(null));
    expect(slashless.status).toBe(301);
    expect(slashless.headers.get("location")).toBe("/tet/");
  });
});
