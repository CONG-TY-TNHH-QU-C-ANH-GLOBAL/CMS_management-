// Deterministic normalization + checks against the real Christmas 2026 landing
// that marketing produced with an AI tool (__fixtures__/xmas-index.html, uploaded
// without its assets/ folder). Its known problems are the oracle: mailto
// fallback form, absolute thgfulfill links, the old "THG Fulfill" brand, the
// missing assets/ folder, and two copied price rows (Microfiber Towel = Blanket,
// Golf Towel = Table Cloth).

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { runDeterministicChecks } from "./landing.checks";
import { scanTags } from "./landing.html";
import {
  LEAD_SCRIPT_PATH,
  detectLang,
  injectLeadScript,
  normalizeLandingHtml,
  secureThgLinks,
} from "./landing.normalize";

const SAMPLE = readFileSync(join(import.meta.dir, "__fixtures__", "xmas-index.html"), "utf8");
const SLUG = "christmas-2026";

/** Every local file the sample references, so the "complete bundle" case is realistic. */
function referencedAssets(html: string): string[] {
  const found = new Set<string>(["index.html"]);
  for (const m of html.matchAll(/assets\/[\w./-]+\.(?:jpg|png|webp)/g)) found.add(m[0]);
  for (const m of html.matchAll(/img:"([\w.-]+)"/g)) found.add(`assets/products/${m[1]}`);
  return [...found];
}

describe("normalizeLandingHtml on the Christmas sample", () => {
  const result = normalizeLandingHtml(SAMPLE, SLUG);

  test("injects exactly one thg-lead.js tag, first in <head> after <meta charset>", () => {
    const tag = `<script src="${LEAD_SCRIPT_PATH}" data-thg-lead data-slug="${SLUG}" data-lang="vi"></script>`;
    expect(result.html.split(tag)).toHaveLength(2);
    const head = result.html.slice(0, result.html.indexOf("</head>"));
    expect(head.indexOf('<meta charset="utf-8">')).toBeLessThan(head.indexOf(tag));
    expect(head.indexOf(tag)).toBeLessThan(head.indexOf("<title>"));
    expect(result.lang).toBe("vi");
  });

  test("is idempotent and leaves the page otherwise byte-identical", () => {
    expect(normalizeLandingHtml(result.html, SLUG).html).toBe(result.html);
    const withoutTag = result.html.replace(
      /\n<script src="\/_thg\/thg-lead\.js"[^>]*><\/script>/,
      "",
    );
    expect(withoutTag).toBe(SAMPLE);
  });

  test("keeps every tag of the original (only adds the script)", () => {
    const before = scanTags(SAMPLE).length;
    expect(scanTags(result.html)).toHaveLength(before + 2);
  });

  test("the sample's thgfulfill.com links are already absolute https, so none are rewritten", () => {
    expect(secureThgLinks(SAMPLE).count).toBe(0);
    expect(result.notes.join(" ")).not.toContain("https");
    expect(SAMPLE.match(/href="https:\/\/thgfulfill\.com/g)?.length).toBeGreaterThan(15);
  });
});

describe("runDeterministicChecks on the Christmas sample", () => {
  const html = normalizeLandingHtml(SAMPLE, SLUG).html;
  const findings = runDeterministicChecks({ html, paths: new Set(["index.html"]) });
  const by = (category: string) => findings.filter((f) => f.category === category);

  test("the missing assets/ folder is critical and lists the referenced files", () => {
    const [asset] = by("asset");
    expect(asset.severity).toBe("critical");
    expect(asset.evidence).toContain("assets/hero-christmas-market-navy.jpg");
    expect(asset.evidence).toContain("assets/products/advent-pet.jpg");
    expect(asset.message).toMatch(/Thiếu \d+ tệp/);
  });

  test("flags both copied price rows by product name", () => {
    const prices = by("price").map((f) => `${f.message} ${f.evidence}`);
    expect(prices).toHaveLength(2);
    expect(prices.find((m) => m.includes("Microfiber"))).toContain("Lambswool Composite Blanket");
    expect(prices.find((m) => m.includes("Golf Towel"))).toContain("Peachskin Velvet Table Cloth");
    expect(by("price").every((f) => f.severity === "major")).toBe(true);
  });

  test("flags the old brand, the mailto fallback and the next-year countdown", () => {
    expect(by("brand")[0].message).toContain('Còn 6 chỗ dùng tên cũ "THG Fulfill"');
    expect(by("form")[0].evidence).toBe("mailto:");
    expect(by("countdown")[0].evidence).toContain("new Date(y+1,11,25)");
  });

  test("does not flag the https thgfulfill links, the Facebook URL or the email domain", () => {
    expect(by("link")).toEqual([]);
    expect(by("brand")[0].evidence).not.toContain("facebook.com/THGFulfill");
    expect(by("placeholder")).toEqual([]);
    expect(by("accessibility")).toEqual([]);
  });

  test("with the assets present, only the content findings remain", () => {
    const complete = runDeterministicChecks({ html, paths: new Set(referencedAssets(SAMPLE)) });
    expect(complete.filter((f) => f.category === "asset")).toEqual([]);
    expect(complete.map((f): string => f.category).sort()).toEqual([
      "brand",
      "countdown",
      "form",
      "price",
      "price",
    ]);
  });
});

describe("deterministic rules on small pages", () => {
  const check = (body: string, paths: string[] = ["index.html"]) =>
    runDeterministicChecks({
      html: `<html lang="en"><head></head><body>${body}</body></html>`,
      paths: new Set(paths),
    });

  test("http resources are major, http links minor, root-relative links and lookalikes major", () => {
    const findings = check(
      '<img src="http://cdn.example.com/a.png" alt="a"><a href="http://example.com">x</a>' +
        '<a href="/vi/catalog">Catalog</a><a href="https://thgfulfill.vn/x">x</a>',
    );
    const links = findings.filter((f) => f.category === "link");
    expect(links.map((f) => f.severity)).toEqual(["major", "minor", "major", "major"]);
  });

  test("placeholder text, missing alt and external form actions", () => {
    const findings = check(
      '<p>Lorem ipsum dolor sit amet</p><img src="a.png"><form action="https://forms.example.com/x"></form>',
      ["index.html", "a.png"],
    );
    expect(findings.map((f) => f.category).sort()).toEqual([
      "accessibility",
      "form",
      "placeholder",
    ]);
  });

  test("css url() references are resolved relative to the stylesheet", () => {
    const findings = runDeterministicChecks({
      html: '<html><head><link rel="stylesheet" href="css/site.css"></head></html>',
      paths: new Set(["index.html", "css/site.css", "img/ok.png"]),
      stylesheets: new Map([
        ["css/site.css", "a{background:url(../img/ok.png)}b{background:url('../img/no.png')}"],
      ]),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].evidence).toBe("img/no.png");
  });

  test("injectLeadScript works without <head> and replaces an earlier tag", () => {
    const once = injectLeadScript("<p>hi</p>", "x", "en");
    expect(once.startsWith("\n<script")).toBe(true);
    expect(injectLeadScript(once, "x", "en")).toBe(once);
    expect(detectLang('<html lang="zh-CN">')).toBe("zh");
    expect(detectLang("<html>")).toBe("vi");
  });

  test("secureThgLinks upgrades http and protocol-relative thgfulfill URLs only", () => {
    const out = secureThgLinks(
      '<a href="http://thgfulfill.com/vi">a</a><a href="//www.thgfulfill.com/x">b</a> visit thgfulfill.com',
    );
    expect(out.count).toBe(2);
    expect(out.html).toBe(
      '<a href="https://thgfulfill.com/vi">a</a><a href="https://www.thgfulfill.com/x">b</a> visit thgfulfill.com',
    );
  });
});
