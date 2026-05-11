// Seed hardcoded structural data from landing components into D1.
// Reads i18n.tsx to resolve translation keys → text per locale.
//
// Run: bun run scripts/migrate-hardcoded-arrays.ts
// Then: bunx wrangler d1 execute thg-cms --local --file=scripts/.tmp-migrate-hardcoded-arrays.sql

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const I18N_SOURCE = resolve(
  process.cwd(),
  "..",
  "THG_landingpage",
  "src",
  "lib",
  "i18n.tsx",
);
const OUT = resolve(process.cwd(), "scripts", ".tmp-migrate-hardcoded-arrays.sql");

type Locale = "en" | "vi" | "zh";
const LOCALES: Locale[] = ["en", "vi", "zh"];

type Translations = Record<string, Record<Locale, string>>;

function escapeSqlString(value: string | null | undefined): string {
  if (value === null || value === undefined) return "NULL";
  return `'${value.replace(/'/g, "''")}'`;
}

function extractTranslations(source: string): Translations {
  const start = source.indexOf("const translations: Translations = {");
  const objStart = source.indexOf("{", start);
  let depth = 0, i = objStart, inStr = false, q = "";
  while (i < source.length) {
    const ch = source[i], prev = source[i - 1];
    if (inStr) {
      if (ch === q && prev !== "\\") inStr = false;
    } else {
      if (ch === '"' || ch === "'" || ch === "`") { inStr = true; q = ch; }
      else if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (depth === 0) break; }
    }
    i++;
  }
  const lit = source.slice(objStart, i + 1);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(`return (${lit});`)() as Translations;
}

// Resolve i18n key → text per locale (fallback to key if missing).
function t(translations: Translations, key: string, locale: Locale): string {
  return translations[key]?.[locale] ?? translations[key]?.en ?? key;
}

// ================================================================
// SEED DATA — extracted from landing components
// ================================================================

interface ServiceSeed {
  id: string;
  position: number;
  icon: string;
  cta_url: string;
  i18n: { name: string; tagline: string; desc: string; cta_text: string };
  bullet_keys: [string, string, string];
}

const SERVICES: ServiceSeed[] = [
  {
    id: "thg-fulfill",
    position: 1,
    icon: "📦",
    cta_url: "/thg-fulfill",
    i18n: {
      name: "services.s1_title",
      tagline: "services.s1_subtitle",
      desc: "services.s1_desc",
      cta_text: "services.learn_more",
    },
    bullet_keys: ["services.s1_b1", "services.s1_b2", "services.s1_b3"],
  },
  {
    id: "thg-express",
    position: 2,
    icon: "✈️",
    cta_url: "/thg-express",
    i18n: {
      name: "services.s2_title",
      tagline: "services.s2_subtitle",
      desc: "services.s2_desc",
      cta_text: "services.learn_more",
    },
    bullet_keys: ["services.s2_b1", "services.s2_b2", "services.s2_b3"],
  },
  {
    id: "thg-warehouse",
    position: 3,
    icon: "🏭",
    cta_url: "/thg-warehouse",
    i18n: {
      name: "services.s3_title",
      tagline: "services.s3_subtitle",
      desc: "services.s3_desc",
      cta_text: "services.learn_more",
    },
    bullet_keys: ["services.s3_b1", "services.s3_b2", "services.s3_b3"],
  },
];

interface FAQSeed {
  position: number;
  q_key: string;
  a_key: string;
}

const FAQS_HOME: FAQSeed[] = [
  { position: 1, q_key: "faq.q1", a_key: "faq.a1" },
  { position: 2, q_key: "faq.q2", a_key: "faq.a2" },
  { position: 3, q_key: "faq.q3", a_key: "faq.a3" },
  { position: 4, q_key: "faq.q4", a_key: "faq.a4" },
  { position: 5, q_key: "faq.q5", a_key: "faq.a5" },
];

interface TestimonialSeed {
  position: number;
  i18n: { name: string; role: string; quote: string };
  avatar_emoji: string;
}

const TESTIMONIALS: TestimonialSeed[] = [
  { position: 1, i18n: { name: "testimonials.t1_name", role: "testimonials.t1_role", quote: "testimonials.t1_quote" }, avatar_emoji: "🇻🇳" },
  { position: 2, i18n: { name: "testimonials.t2_name", role: "testimonials.t2_role", quote: "testimonials.t2_quote" }, avatar_emoji: "🇺🇸" },
  { position: 3, i18n: { name: "testimonials.t3_name", role: "testimonials.t3_role", quote: "testimonials.t3_quote" }, avatar_emoji: "🇻🇳" },
  { position: 4, i18n: { name: "testimonials.t4_name", role: "testimonials.t4_role", quote: "testimonials.t4_quote" }, avatar_emoji: "🇺🇸" },
];

interface ContactSeed {
  position: number;
  kind: "office" | "warehouse" | "phone" | "email" | "website";
  label_key: string;
  address?: string;
  phone?: string;
  url?: string;
  lang_class?: string;
}

const CONTACT_LOCATIONS: ContactSeed[] = [
  { position: 1, kind: "office",    label_key: "contact.vn_office",       address: "121/5 Đ. Kênh 19/5, Sơn Kỳ, Tân Phú, TP.HCM" },
  { position: 2, kind: "warehouse", label_key: "contact.us_pa_warehouse", address: "108 Almond CT, Milford, PA 18337", phone: "+1 (570) 618-1169" },
  { position: 3, kind: "warehouse", label_key: "contact.us_nc_warehouse", address: "4136 Sunflower Circle, Winston-Salem, NC 27105" },
  { position: 4, kind: "warehouse", label_key: "contact.cn_warehouse",    address: "广东省东莞市常平镇霞坑新宅二区三街101", lang_class: "font-cn" },
  { position: 5, kind: "phone",     label_key: "contact.hotline",         phone: "0335.124.089" },
  { position: 6, kind: "email",     label_key: "contact.email",           url: "mailto:info@thgfulfill.com" },
  { position: 7, kind: "website",   label_key: "contact.website",         url: "https://thgfulfill.com" },
];

interface IntegrationSeed {
  position: number;
  name: string;
  url: string;
  color_class: string;
}

const INTEGRATIONS: IntegrationSeed[] = [
  { position: 1, name: "Etsy",         url: "https://etsy.com",         color_class: "bg-orange-50 border-orange-200" },
  { position: 2, name: "Amazon",       url: "https://amazon.com",       color_class: "bg-amber-50 border-amber-200" },
  { position: 3, name: "TikTok Shop",  url: "https://shop.tiktok.com",  color_class: "bg-slate-50 border-slate-200" },
  { position: 4, name: "eBay",         url: "https://ebay.com",         color_class: "bg-blue-50 border-blue-200" },
  { position: 5, name: "Shopify",      url: "https://shopify.com",      color_class: "bg-green-50 border-green-200" },
  { position: 6, name: "WooCommerce",  url: "https://woocommerce.com",  color_class: "bg-purple-50 border-purple-200" },
];

const MARQUEE_IMAGES = [
  { position: 1, url: "https://w.ladicdn.com/s1500x1100/67e69e24e8a7ba001127c80a/kho-my-10-1-20250729095528-mkcfd.jpg",         alt: "THG warehouse PA — packing area 10" },
  { position: 2, url: "https://w.ladicdn.com/s1500x1100/67e69e24e8a7ba001127c80a/kho-my-11-1-20250729095528-nzruq.jpg",         alt: "THG warehouse PA — packing area 11" },
  { position: 3, url: "https://w.ladicdn.com/s1500x1100/67e69e24e8a7ba001127c80a/kho-my-14-1-20250729095528-dcsxm.jpg",         alt: "THG warehouse PA — packing area 14" },
  { position: 4, url: "https://w.ladicdn.com/s1500x1100/67e69e24e8a7ba001127c80a/1-20250724024641-4oczs.png",                   alt: "THG warehouse PA — overview" },
  { position: 5, url: "https://w.ladicdn.com/s1500x1100/67e69e24e8a7ba001127c80a/kho-my-13-20250724024632-bt6u-.jpg",           alt: "THG warehouse PA — packing area 13" },
  { position: 6, url: "https://w.ladicdn.com/s1500x1100/67e69e24e8a7ba001127c80a/img_9873-20250801074610-q-tfu.jpg",            alt: "THG warehouse — fulfillment workflow" },
  { position: 7, url: "https://w.ladicdn.com/s1500x1100/67e69e24e8a7ba001127c80a/img_9988-20250801074609-jjvij.jpg",            alt: "THG warehouse — outbound packages" },
  { position: 8, url: "https://w.ladicdn.com/s1500x1100/67e69e24e8a7ba001127c80a/retouch_2025072518361201-20250801074608-tsi9a.jpg", alt: "THG warehouse — staff at work" },
  { position: 9, url: "https://w.ladicdn.com/s1500x1100/67e69e24e8a7ba001127c80a/img_7181-20250801190217-bvrod.jpg",            alt: "THG warehouse — pallet area" },
];

// ================================================================
// SQL GENERATION
// ================================================================

async function main() {
  const { readFile } = await import("node:fs/promises");
  const i18nSource = await readFile(I18N_SOURCE, "utf8");
  const translations = extractTranslations(i18nSource);

  const lines: string[] = [
    "-- Generated by scripts/migrate-hardcoded-arrays.ts",
    "-- Idempotent: clears + re-inserts each domain. Safe to re-run.",
    "BEGIN TRANSACTION;",
    "",
  ];

  // -------- SERVICES + services_i18n + service_bullets --------
  lines.push("-- ===== SERVICES =====");
  lines.push("DELETE FROM service_bullets;");
  lines.push("DELETE FROM services_i18n;");
  lines.push("DELETE FROM services;");
  for (const svc of SERVICES) {
    lines.push(
      `INSERT INTO services(id, position, icon, status) VALUES(${escapeSqlString(svc.id)}, ${svc.position}, ${escapeSqlString(svc.icon)}, 'live');`,
    );
    for (const locale of LOCALES) {
      const name = t(translations, svc.i18n.name, locale);
      const tagline = t(translations, svc.i18n.tagline, locale);
      const body = t(translations, svc.i18n.desc, locale);
      const ctaText = t(translations, svc.i18n.cta_text, locale);
      lines.push(
        `INSERT INTO services_i18n(service_id, locale, name, tagline, hero_title, hero_sub, cta_text, cta_url, body_md) ` +
          `VALUES(${escapeSqlString(svc.id)}, ${escapeSqlString(locale)}, ${escapeSqlString(name)}, ${escapeSqlString(tagline)}, ${escapeSqlString(name)}, ${escapeSqlString(body)}, ${escapeSqlString(ctaText)}, ${escapeSqlString(svc.cta_url)}, ${escapeSqlString(body)});`,
      );
      svc.bullet_keys.forEach((bkey, idx) => {
        const text = t(translations, bkey, locale);
        lines.push(
          `INSERT INTO service_bullets(service_id, locale, position, text) ` +
            `VALUES(${escapeSqlString(svc.id)}, ${escapeSqlString(locale)}, ${idx + 1}, ${escapeSqlString(text)});`,
        );
      });
    }
  }
  lines.push("");

  // -------- FAQS (home) --------
  lines.push("-- ===== FAQS (home) =====");
  lines.push("DELETE FROM faqs WHERE scope = 'home';");
  for (const faq of FAQS_HOME) {
    for (const locale of LOCALES) {
      const q = t(translations, faq.q_key, locale);
      const a = t(translations, faq.a_key, locale);
      lines.push(
        `INSERT INTO faqs(scope, position, locale, question, answer) ` +
          `VALUES('home', ${faq.position}, ${escapeSqlString(locale)}, ${escapeSqlString(q)}, ${escapeSqlString(a)});`,
      );
    }
  }
  lines.push("");

  // -------- TESTIMONIALS --------
  lines.push("-- ===== TESTIMONIALS =====");
  lines.push("DELETE FROM testimonials;");
  for (const tt of TESTIMONIALS) {
    for (const locale of LOCALES) {
      const name = t(translations, tt.i18n.name, locale);
      const role = t(translations, tt.i18n.role, locale);
      const quote = t(translations, tt.i18n.quote, locale);
      // avatar_media_id NULL — store emoji in author_role suffix? Or skip for now.
      // For Phase 1 keep avatar as emoji prefix in author_name to preserve UX
      const nameWithFlag = `${tt.avatar_emoji} ${name}`;
      lines.push(
        `INSERT INTO testimonials(position, locale, quote, author_name, author_role) ` +
          `VALUES(${tt.position}, ${escapeSqlString(locale)}, ${escapeSqlString(quote)}, ${escapeSqlString(nameWithFlag)}, ${escapeSqlString(role)});`,
      );
    }
  }
  lines.push("");

  // -------- CONTACT_LOCATIONS --------
  lines.push("-- ===== CONTACT LOCATIONS =====");
  lines.push("DELETE FROM contact_locations;");
  for (const c of CONTACT_LOCATIONS) {
    for (const locale of LOCALES) {
      const label = t(translations, c.label_key, locale);
      lines.push(
        `INSERT INTO contact_locations(position, kind, locale, label, address, phone, url, lang_class) ` +
          `VALUES(${c.position}, ${escapeSqlString(c.kind)}, ${escapeSqlString(locale)}, ${escapeSqlString(label)}, ${escapeSqlString(c.address ?? null)}, ${escapeSqlString(c.phone ?? null)}, ${escapeSqlString(c.url ?? null)}, ${escapeSqlString(c.lang_class ?? null)});`,
      );
    }
  }
  lines.push("");

  // -------- INTEGRATIONS --------
  lines.push("-- ===== INTEGRATIONS =====");
  lines.push("DELETE FROM integrations;");
  for (const intg of INTEGRATIONS) {
    lines.push(
      `INSERT INTO integrations(position, name, url, color_class) ` +
        `VALUES(${intg.position}, ${escapeSqlString(intg.name)}, ${escapeSqlString(intg.url)}, ${escapeSqlString(intg.color_class)});`,
    );
  }
  lines.push("");

  // -------- MARQUEE IMAGES --------
  lines.push("-- ===== MARQUEE IMAGES =====");
  lines.push("DELETE FROM marquee_images;");
  lines.push("DELETE FROM media WHERE r2_key LIKE 'https://w.ladicdn.com/%';");
  for (const img of MARQUEE_IMAGES) {
    // Insert media row as external URL placeholder (r2_key holds the URL).
    // Asset handler will detect http:// prefix and proxy/redirect.
    lines.push(
      `INSERT INTO media(r2_key, mime, bytes, alt_text, status) ` +
        `VALUES(${escapeSqlString(img.url)}, 'image/jpeg', 0, ${escapeSqlString(img.alt)}, 'ready');`,
    );
    lines.push(
      `INSERT INTO marquee_images(position, media_id, alt_text) ` +
        `VALUES(${img.position}, last_insert_rowid(), ${escapeSqlString(img.alt)});`,
    );
  }
  lines.push("");

  lines.push("COMMIT;");

  writeFileSync(OUT, lines.join("\n") + "\n", "utf8");

  console.log(`✓ Wrote SQL to ${OUT}`);
  console.log("");
  console.log("Summary:");
  console.log(`  Services:           ${SERVICES.length} × 3 locales = ${SERVICES.length * 3} services_i18n + ${SERVICES.length * 3 * 3} bullets`);
  console.log(`  FAQs (home):        ${FAQS_HOME.length} × 3 locales = ${FAQS_HOME.length * 3} rows`);
  console.log(`  Testimonials:       ${TESTIMONIALS.length} × 3 locales = ${TESTIMONIALS.length * 3} rows`);
  console.log(`  Contact locations:  ${CONTACT_LOCATIONS.length} × 3 locales = ${CONTACT_LOCATIONS.length * 3} rows`);
  console.log(`  Integrations:       ${INTEGRATIONS.length} rows (locale-agnostic)`);
  console.log(`  Marquee images:     ${MARQUEE_IMAGES.length} media + marquee rows`);
  console.log("");
  console.log("Apply locally:");
  console.log("  bunx wrangler d1 execute thg-cms --local --file=scripts/.tmp-migrate-hardcoded-arrays.sql");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
