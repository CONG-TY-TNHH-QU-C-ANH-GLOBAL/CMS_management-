// The standard TH Group header for uploaded landing pages.
//
// SOURCE OF TRUTH: THG_landingpage src/components/Navbar.tsx and
// src/lib/i18n/translations/nav.ts (origin/main). This is a static, CSS-only
// mirror of that navbar — same items, same order, same labels, absolute
// thgfulfill.com links — because an uploaded page cannot run the site's React.
// KEEP IN SYNC BY HAND when the site's navbar changes (items, labels, hrefs).
//
// The AI format step never writes header markup: it only says WHICH element of
// the page is its own header, and code splices in renderStandardHeader().
// Every class is prefixed `thg-h` and the CSS is scoped under #thg-header so it
// cannot collide with the uploaded page's styles.

import type { LandingLang } from "./landing.normalize";

export const SITE_ORIGIN = "https://thgfulfill.com";
export const HUB_URL = "https://hub.thgfulfill.com";
export const LOGO_URL = `${SITE_ORIGIN}/logo.png`;

export const HEADER_START = "<!-- thg:header:start -->";
export const HEADER_END = "<!-- thg:header:end -->";

type Labels = Record<LandingLang, string>;
const tr = (en: string, vi: string, zh: string): Labels => ({ en, vi, zh });

interface NavLink {
  label: Labels;
  desc?: Labels;
  href: string;
}

// nav.ts keys in comments so a diff against the site is mechanical.
const SERVICES: NavLink[] = [
  {
    label: tr("TH Group Fulfill", "TH Group Fulfill", "TH Group Fulfill"), // nav.thg_fulfill
    desc: tr(
      "POD & Dropship with competitive base pricing",
      "POD & Dropship với chi phí gốc cạnh tranh",
      "具有竞争力的POD和代发",
    ),
    href: "/thg-fulfill",
  },
  {
    label: tr("TH Group Express", "TH Group Express", "TH Group Express"), // nav.thg_express
    desc: tr(
      "International shipping VN/CN → US/UK/EU",
      "Vận chuyển quốc tế VN/CN → US/UK/EU",
      "国际运输 VN/CN → US/UK/EU",
    ),
    href: "/thg-express",
  },
  {
    label: tr("TH Group Warehouse", "TH Group Warehouse", "TH Group Warehouse"), // nav.thg_warehouse
    desc: tr(
      "US warehouse & domestic fulfillment from $1.2",
      "Kho & fulfill nội địa Mỹ từ 1.2$",
      "美国仓储及履约低至1.2美元",
    ),
    href: "/thg-warehouse",
  },
  {
    label: tr("TH Group Dropship", "TH Group Dropship", "TH Group代发"), // nav.thg_order
    desc: tr(
      "Buy from Taobao/1688, ship direct to USA",
      "Mua hàng từ Taobao/1688, giao thẳng đến Mỹ",
      "淘宝/1688代购直邮美国",
    ),
    href: "/thg-order",
  },
];

const PRICING: NavLink[] = [
  {
    label: tr("International Pricing", "Bảng giá Quốc tế", "国际运费"), // nav.intl_pricing
    href: "/international-pricing",
  },
  {
    label: tr("3PL Warehouse Rates", "Biểu phí cước 3PL", "3PL仓库费率"), // nav.domestic_pricing
    href: "/domestic-pricing",
  },
  {
    label: tr("Formal Customs Rates", "Bảng giá ship chính ngạch", "正规报关运费"), // nav.chinhngach_pricing
    href: "/chinh-ngach-pricing",
  },
  {
    label: tr("Product Catalog", "Catalog Mẫu Sản Phẩm", "产品目录"), // nav.catalog
    href: "/catalog",
  },
];

const EVENTS: NavLink[] = [
  { label: tr("Events", "Event", "活动"), href: "/events" }, // nav.event
  { label: tr("FAQ", "Câu hỏi thường gặp", "常见问题"), href: "/#faq" }, // nav.faq
];

const PLAIN: NavLink[] = [
  { label: tr("Policy", "Chính sách", "政策"), href: "/policy" }, // nav.policy
  { label: tr("Blog", "Blog", "Blog"), href: "/blog" }, // nav.news
  { label: tr("Careers", "Tuyển dụng", "招骋"), href: "/careers" }, // nav.careers
];

const GROUPS: { label: Labels; items: NavLink[] }[] = [
  { label: tr("Services", "Dịch vụ", "服务"), items: SERVICES }, // nav.services
  { label: tr("Pricing list", "Bảng giá", "价格"), items: PRICING }, // nav.pricing
  { label: tr("Events", "Event", "活动"), items: EVENTS }, // nav.event
];

const CONSULT = tr("Get Started", "Tư vấn ngay", "立即咨询"); // nav.consult
const LANGS: { code: LandingLang; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "vi", label: "VI" },
  { code: "zh", label: "中" },
];

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const siteUrl = (lang: LandingLang, path: string) => `${SITE_ORIGIN}/${lang}${path}`;

const HEADER_CSS = `#thg-header{position:sticky;top:0;z-index:9990;background:rgba(250,248,245,.94);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-bottom:1px solid hsl(40 15% 90%);font-family:"Be Vietnam Pro",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:hsl(220 25% 12%);font-size:14px;line-height:1.4}
#thg-header *{box-sizing:border-box}
#thg-header a{color:inherit;text-decoration:none}
#thg-header .thg-h-in{max-width:1400px;margin:0 auto;padding:0 16px;height:72px;display:flex;align-items:center;justify-content:space-between;gap:16px}
#thg-header .thg-h-logo img{height:40px;width:auto;display:block}
#thg-header .thg-h-nav{display:flex;align-items:center;gap:4px}
#thg-header .thg-h-group{position:relative}
#thg-header .thg-h-item{display:flex;align-items:center;gap:4px;padding:8px 14px;border-radius:8px;font-weight:500;color:hsl(220 25% 12% / .8);background:none;border:0;font:inherit;cursor:pointer}
#thg-header .thg-h-item:hover,#thg-header .thg-h-group:focus-within>.thg-h-item{background:hsl(40 18% 92% / .6);color:hsl(220 25% 12%)}
#thg-header .thg-h-menu{position:absolute;top:100%;left:0;padding-top:10px;opacity:0;visibility:hidden;transform:translateY(-8px);transition:all .2s}
#thg-header .thg-h-group:hover .thg-h-menu,#thg-header .thg-h-group:focus-within .thg-h-menu{opacity:1;visibility:visible;transform:none}
#thg-header .thg-h-panel{background:#fff;border:1px solid hsl(40 15% 90%);border-radius:16px;box-shadow:0 20px 60px -15px hsl(36 45% 42% / .2);padding:12px;min-width:300px}
#thg-header .thg-h-panel a{display:block;padding:10px 12px;border-radius:12px}
#thg-header .thg-h-panel a:hover{background:hsl(40 18% 92% / .6)}
#thg-header .thg-h-panel b{display:block;font-size:14px;font-weight:600}
#thg-header .thg-h-panel small{display:block;margin-top:2px;font-size:12px;color:hsl(220 10% 46%)}
#thg-header .thg-h-right{display:flex;align-items:center;gap:12px}
#thg-header .thg-h-lang{display:flex;gap:2px;background:hsl(40 18% 92% / .8);border-radius:999px;padding:4px}
#thg-header .thg-h-lang a{padding:4px 10px;border-radius:999px;font-size:12px;font-weight:500;color:hsl(220 10% 46%)}
#thg-header .thg-h-lang a[aria-current]{background:hsl(36 45% 42%);color:#fff}
#thg-header .thg-h-hub{font-weight:500;color:hsl(220 10% 46%)}
#thg-header .thg-h-cta{display:inline-flex;align-items:center;border-radius:999px;padding:12px 24px;background:hsl(36 45% 42%);color:#fff!important;font-weight:700;box-shadow:0 4px 12px -4px hsl(36 45% 42% / .6);border:0;cursor:pointer}
#thg-header .thg-h-cta:hover{background:hsl(36 50% 28%)}
#thg-header .thg-h-mobile{display:none}
#thg-header .thg-h-mobile summary{list-style:none;cursor:pointer;padding:10px 12px;border-radius:12px;background:hsl(40 18% 92% / .5);font-weight:600}
#thg-header .thg-h-mobile summary::-webkit-details-marker{display:none}
#thg-header .thg-h-sheet{position:absolute;left:0;right:0;top:72px;background:#fff;border-top:1px solid hsl(40 15% 90%);padding:16px;max-height:calc(100vh - 72px);overflow-y:auto;box-shadow:0 20px 60px -15px rgba(0,0,0,.15)}
#thg-header .thg-h-sheet p{margin:12px 0 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:hsl(220 10% 46%)}
#thg-header .thg-h-sheet a{display:block;padding:10px 12px;border-radius:12px;font-weight:500}
#thg-header .thg-h-sheet .thg-h-cta{display:flex;justify-content:center;margin-top:16px}
@media (max-width:1023px){#thg-header .thg-h-nav,#thg-header .thg-h-right{display:none}#thg-header .thg-h-mobile{display:block}}`;

function desktopGroup(group: { label: Labels; items: NavLink[] }, lang: LandingLang): string {
  const items = group.items
    .map(
      (item) =>
        `<a href="${siteUrl(lang, item.href)}"><b translate="no">${esc(item.label[lang])}</b>${
          item.desc ? `<small>${esc(item.desc[lang])}</small>` : ""
        }</a>`,
    )
    .join("");
  return `<div class="thg-h-group"><button type="button" class="thg-h-item" aria-haspopup="true"><span translate="no">${esc(
    group.label[lang],
  )}</span> ▾</button><div class="thg-h-menu"><div class="thg-h-panel">${items}</div></div></div>`;
}

function languageSwitch(lang: LandingLang): string {
  const links = LANGS.map(
    (l) =>
      `<a href="${SITE_ORIGIN}/${l.code}" hreflang="${l.code}"${
        l.code === lang ? ' aria-current="true"' : ""
      }>${l.label}</a>`,
  ).join("");
  return `<div class="thg-h-lang" role="group" aria-label="Language">${links}</div>`;
}

function mobileSheet(lang: LandingLang): string {
  const sections = GROUPS.map(
    (g) =>
      `<p translate="no">${esc(g.label[lang])}</p>${g.items
        .map((i) => `<a href="${siteUrl(lang, i.href)}" translate="no">${esc(i.label[lang])}</a>`)
        .join("")}`,
  ).join("");
  const plain = PLAIN.map(
    (i) => `<a href="${siteUrl(lang, i.href)}" translate="no">${esc(i.label[lang])}</a>`,
  ).join("");
  return `<details class="thg-h-mobile"><summary aria-label="Menu">☰</summary><div class="thg-h-sheet">${languageSwitch(
    lang,
  )}${sections}<p></p>${plain}<a class="thg-h-cta" data-consult href="#thg-consult">${esc(
    CONSULT[lang],
  )}</a><a href="${HUB_URL}" target="_blank" rel="noopener noreferrer">Hub System</a></div></details>`;
}

/** The complete header block, wrapped in markers so later steps (and a re-run) can find it. */
export function renderStandardHeader(lang: LandingLang): string {
  const plain = PLAIN.map(
    (i) =>
      `<a class="thg-h-item" href="${siteUrl(lang, i.href)}"><span translate="no">${esc(
        i.label[lang],
      )}</span></a>`,
  ).join("");
  return [
    HEADER_START,
    `<style>${HEADER_CSS}</style>`,
    `<header id="thg-header"><div class="thg-h-in">`,
    `<a class="thg-h-logo" href="${SITE_ORIGIN}/${lang}" aria-label="TH Group — Transport Happiness Group"><img src="${LOGO_URL}" alt="TH Group" width="168" height="40"></a>`,
    `<nav class="thg-h-nav" aria-label="TH Group">${GROUPS.map((g) => desktopGroup(g, lang)).join("")}${plain}</nav>`,
    `<div class="thg-h-right">${languageSwitch(lang)}<a class="thg-h-hub" href="${HUB_URL}" target="_blank" rel="noopener noreferrer">Hub System</a><a class="thg-h-cta" data-consult href="#thg-consult">${esc(CONSULT[lang])}</a></div>`,
    mobileSheet(lang),
    `</div></header>`,
    HEADER_END,
  ].join("\n");
}
