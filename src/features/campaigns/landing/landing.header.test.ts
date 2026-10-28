// The standard TH Group header injected into uploaded landings must match the main site's
// navbar. The site lives in another repository, so this file keeps a COMMITTED SNAPSHOT of
// that navbar instead of reading it at runtime (no cross-repo coupling):
//
//   THG_landingpage origin/main @ 9dfa9aa (2026-10-23)
//     src/components/Navbar.tsx            item order, hrefs, groups
//     src/lib/i18n/translations/nav.ts     labels (en, vi, zh)
//
// When the site's navbar changes, update SITE_NAV from those two files (git show
// origin/main:<path>) and then landing.header.ts — this test fails until both agree.
//
// Known, accepted difference: the site shows a description under every dropdown item; the
// landing header shows it for the four services only (pricing / events items are label-only).

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import { HEADER_END, HEADER_START, renderStandardHeader } from "./landing.header";
import { LOGO_URL } from "./landing.logo";
import type { LandingLang } from "./landing.normalize";

type L = [en: string, vi: string, zh: string];
interface Item {
  label: L;
  href: string;
}

const SITE_NAV: {
  groups: { label: L; items: (Item & { desc?: L })[] }[];
  plain: Item[];
  consult: L;
  hub: string;
} = {
  groups: [
    {
      label: ["Services", "Dịch vụ", "服务"],
      items: [
        {
          label: ["TH Group Fulfill", "TH Group Fulfill", "TH Group Fulfill"],
          href: "/thg-fulfill",
          desc: [
            "POD & Dropship with competitive base pricing",
            "POD & Dropship với chi phí gốc cạnh tranh",
            "具有竞争力的POD和代发",
          ],
        },
        {
          label: ["TH Group Express", "TH Group Express", "TH Group Express"],
          href: "/thg-express",
          desc: [
            "International shipping VN/CN → US/UK/EU",
            "Vận chuyển quốc tế VN/CN → US/UK/EU",
            "国际运输 VN/CN → US/UK/EU",
          ],
        },
        {
          label: ["TH Group Warehouse", "TH Group Warehouse", "TH Group Warehouse"],
          href: "/thg-warehouse",
          desc: [
            "US warehouse & domestic fulfillment from $1.2",
            "Kho & fulfill nội địa Mỹ từ 1.2$",
            "美国仓储及履约低至1.2美元",
          ],
        },
        {
          label: ["TH Group Dropship", "TH Group Dropship", "TH Group代发"],
          href: "/thg-order",
          desc: [
            "Buy from Taobao/1688, ship direct to USA",
            "Mua hàng từ Taobao/1688, giao thẳng đến Mỹ",
            "淘宝/1688代购直邮美国",
          ],
        },
      ],
    },
    {
      label: ["Pricing list", "Bảng giá", "价格"],
      items: [
        {
          label: ["International Pricing", "Bảng giá Quốc tế", "国际运费"],
          href: "/international-pricing",
        },
        {
          label: ["3PL Warehouse Rates", "Biểu phí cước 3PL", "3PL仓库费率"],
          href: "/domestic-pricing",
        },
        {
          label: ["Formal Customs Rates", "Bảng giá ship chính ngạch", "正规报关运费"],
          href: "/chinh-ngach-pricing",
        },
        { label: ["Product Catalog", "Catalog Mẫu Sản Phẩm", "产品目录"], href: "/catalog" },
      ],
    },
    {
      label: ["Events", "Event", "活动"],
      items: [
        { label: ["Events", "Event", "活动"], href: "/events" },
        { label: ["FAQ", "Câu hỏi thường gặp", "常见问题"], href: "/#faq" },
      ],
    },
  ],
  plain: [
    { label: ["Policy", "Chính sách", "政策"], href: "/policy" },
    { label: ["Blog", "Blog", "Blog"], href: "/blog" },
    { label: ["Careers", "Tuyển dụng", "招骋"], href: "/careers" },
  ],
  consult: ["Get Started", "Tư vấn ngay", "立即咨询"],
  hub: "https://hub.thgfulfill.com",
};

const LANGS: LandingLang[] = ["en", "vi", "zh"];
const idx = (lang: LandingLang) => LANGS.indexOf(lang);
const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
const text = (html: string) => decode(html.replace(/<[^>]+>/g, "").trim());

function anchors(html: string) {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({
    attrs: m[1],
    href: /href="([^"]*)"/.exec(m[1])?.[1] ?? "",
    inner: m[2],
  }));
}

describe.each(LANGS)("standard header (%s)", (lang) => {
  const html = renderStandardHeader(lang);
  const i = idx(lang);
  const site = (path: string) => `https://thgfulfill.com/${lang}${path}`;
  const desktop = html.slice(html.indexOf('<nav class="thg-h-nav"'), html.indexOf("</nav>"));
  const mobile = html.slice(
    html.indexOf('<details class="thg-h-mobile"'),
    html.indexOf("</details>"),
  );

  test("is wrapped in the markers and has the TH Group logo linking home", () => {
    expect(html.startsWith(HEADER_START)).toBe(true);
    expect(html.endsWith(HEADER_END)).toBe(true);
    expect(html).toContain(`<a class="thg-h-logo" href="${site("")}"`);
    expect(html).toContain(`<img src="${LOGO_URL}" alt="TH Group"`);
    const image = Buffer.from(LOGO_URL.slice("data:image/webp;base64,".length), "base64");
    expect(createHash("sha256").update(image).digest("hex")).toBe(
      "d37985d08da6688ef84e3a4aab3df129cd18297261b02f64971767efd9169db2",
    );
    expect(html).not.toMatch(/THG\s+Fulfill/i);
  });

  test("desktop nav: the site's groups, items, labels and hrefs in order", () => {
    const groupLabels = [
      ...desktop.matchAll(/<button[^>]*class="thg-h-item"[^>]*>([\s\S]*?)<\/button>/g),
    ].map((m) => text(m[1]).replace(/\s*▾$/, ""));
    expect(groupLabels).toEqual(SITE_NAV.groups.map((g) => g.label[i]));
    const links = anchors(desktop).map((a) => ({
      href: a.href,
      label: text(/<b[^>]*>([\s\S]*?)<\/b>/.exec(a.inner)?.[1] ?? a.inner),
    }));
    expect(links).toEqual([
      ...SITE_NAV.groups.flatMap((g) =>
        g.items.map((it) => ({ href: site(it.href), label: it.label[i] })),
      ),
      ...SITE_NAV.plain.map((it) => ({ href: site(it.href), label: it.label[i] })),
    ]);
    const services = anchors(desktop)
      .slice(0, 4)
      .map((a) => text(/<small>([\s\S]*?)<\/small>/.exec(a.inner)?.[1] ?? ""));
    expect(services).toEqual(SITE_NAV.groups[0].items.map((it) => it.desc![i]));
  });

  test("mobile sheet carries the same items, the lang switch, the CTA and Hub", () => {
    const hrefs = anchors(mobile).map((a) => a.href);
    expect(hrefs).toEqual([
      "https://thgfulfill.com/en",
      "https://thgfulfill.com/vi",
      "https://thgfulfill.com/zh",
      ...SITE_NAV.groups.flatMap((g) => g.items.map((it) => site(it.href))),
      ...SITE_NAV.plain.map((it) => site(it.href)),
      "#thg-consult",
      SITE_NAV.hub,
    ]);
  });

  test("lang switch marks the current language; every link is absolute https except the CTA", () => {
    const lang_ = html.slice(
      html.indexOf('<div class="thg-h-lang"'),
      html.indexOf("</div>", html.indexOf('<div class="thg-h-lang"')),
    );
    const current = anchors(lang_).filter((a) => a.attrs.includes("aria-current"));
    expect(current.map((a) => a.href)).toEqual([`https://thgfulfill.com/${lang}`]);
    for (const a of anchors(html)) {
      if (a.href === "#thg-consult") continue;
      expect(a.href).toMatch(/^https:\/\/(?:hub\.)?thgfulfill\.com(?:\/|$)/);
    }
    for (const m of html.matchAll(/\bsrc="([^"]+)"/g)) expect(m[1]).toBe(LOGO_URL);
  });

  test("both consult CTAs carry data-consult (thg-lead.js opens the form) with the site's label", () => {
    const ctas = anchors(html).filter((a) => a.href === "#thg-consult");
    expect(ctas).toHaveLength(2);
    for (const cta of ctas) {
      expect(cta.attrs).toMatch(/\bdata-consult\b/);
      expect(text(cta.inner)).toBe(SITE_NAV.consult[i]);
    }
    const hub = anchors(html).filter((a) => a.href === SITE_NAV.hub);
    expect(hub).toHaveLength(2);
    for (const h of hub) expect(h.attrs).toContain('rel="noopener noreferrer"');
  });
});
