// Generates the SQL seed for /thg-fulfill generic service_blocks rows:
// journey_step, capability, section_copy. Source text is mirrored EXACTLY from the merged Next.js
// landing fallback (THG_landingpage next/src/features/fulfill/localized-content.ts) so the public
// page renders identical copy whether the CMS row exists or the static fallback fires — this is a
// source-of-truth migration, not a copywriting change. Each block carries a canonical, immutable
// payload.key that binds it to a code-owned landing role (the landing resolves by key, never by
// position/order).
//
// Run:
//   bun run db/seeds/fulfill-service-blocks.ts > db/seeds/fulfill-service-blocks.sql
//   bunx wrangler d1 execute thg-cms --remote --file=db/seeds/fulfill-service-blocks.sql
//
// Idempotency: starts with `DELETE FROM service_blocks WHERE page_slug='thg-fulfill'` (FK cascade
// clears its service_block_translations), then re-inserts. Unlike the older order seed, this file
// ALSO emits the EN/ZH reviewed-translation backfill itself (migration 0020 only backfilled rows
// that existed when it ran), so re-running this one seed fully restores all three locales.

type Trio = { en: string; vi: string; zh: string };

interface Block {
  position: number;
  /** Canonical, immutable landing role key → payload.key (never id/position/title). */
  key: string;
  title: Trio;
  description: Trio;
}

interface KindBundle {
  kind: string;
  blocks: Block[];
}

const journey: Block[] = [
  {
    position: 1,
    key: "design-input",
    title: { en: "Design Input", vi: "Design Input", zh: "Design Input" },
    description: {
      en: "Receive products and design files, assigning an operational ID to every unit.",
      vi: "Tiếp nhận sản phẩm & file thiết kế, gắn định danh (ID) vận hành cho từng đơn vị.",
      zh: "接收产品与设计文件，为每个单元分配运营ID。",
    },
  },
  {
    position: 2,
    key: "processing",
    title: { en: "Processing · POD", vi: "Processing · POD", zh: "Processing · POD" },
    description: {
      en: "High-resolution POD printing (DTG/DTF) in Vietnam, China and the US.",
      vi: "In POD (DTG/DTF) độ phân giải cao tại VN · CN · US.",
      zh: "在越南·中国·美国进行高分辨率POD打印（DTG/DTF）。",
    },
  },
  {
    position: 3,
    key: "quality-assurance",
    title: { en: "Quality Assurance", vi: "Quality Assurance", zh: "Quality Assurance" },
    description: {
      en: "Item-level QC: file format, color and print quality — to US eCommerce standard.",
      vi: "QC từng đơn: định dạng, màu sắc, chất lượng in — chuẩn TMĐT Mỹ.",
      zh: "逐单质检：文件格式、颜色与印刷质量——达到美国电商标准。",
    },
  },
  {
    position: 4,
    key: "dispatch-ready",
    title: { en: "Dispatch Ready", vi: "Dispatch Ready", zh: "Dispatch Ready" },
    description: {
      en: "Standards-compliant packing with a shipping label and tracking.",
      vi: "Đóng gói chuẩn quy cách, dán nhãn vận chuyển + tracking.",
      zh: "按规范包装，贴运输标签并提供追踪。",
    },
  },
];

const capability: Block[] = [
  {
    position: 1,
    key: "network",
    title: { en: "Cross-border network", vi: "Cross-border network", zh: "Cross-border network" },
    description: {
      en: "POD workshops in VN · CN and US domestic fulfillment — routed by product and destination.",
      vi: "Xưởng POD tại VN · CN và fulfill nội địa US — định tuyến theo sản phẩm & điểm đến.",
      zh: "越南·中国的POD车间与美国本土履约——按产品与目的地路由。",
    },
  },
  {
    position: 2,
    key: "qc",
    title: { en: "Item-level QC", vi: "Item-level QC", zh: "Item-level QC" },
    description: {
      en: "Quality-checking every order before it is packed.",
      vi: "Kiểm tra chất lượng từng đơn trước khi đóng gói.",
      zh: "在包装前检查每一个订单的质量。",
    },
  },
  {
    position: 3,
    key: "pack",
    title: { en: "US standard packing", vi: "Đóng gói chuẩn Mỹ", zh: "US standard packing" },
    description: {
      en: "US eCommerce-standard packing with label and tracking.",
      vi: "Đóng gói chuẩn TMĐT Mỹ, dán nhãn + tracking.",
      zh: "美国电商标准包装，附标签与追踪。",
    },
  },
  {
    position: 4,
    key: "hub",
    title: { en: "Hub System", vi: "Hub System", zh: "Hub System" },
    description: {
      en: "Order and product status visible step by step — no manual file digging.",
      vi: "Trạng thái đơn hàng & sản phẩm hiển thị theo từng bước — không cần dò file thủ công.",
      zh: "订单与产品状态按步骤可见——无需手动翻查文件。",
    },
  },
  {
    position: 5,
    key: "intake",
    title: { en: "Intake & ID", vi: "Tiếp nhận & định danh", zh: "Intake & ID" },
    description: {
      en: "Receiving products and files, assigning an operational ID.",
      vi: "Tiếp nhận sản phẩm & file, gắn định danh vận hành.",
      zh: "接收产品与文件，分配运营标识。",
    },
  },
  {
    position: 6,
    key: "print",
    title: { en: "POD & personalization", vi: "POD & cá nhân hóa", zh: "POD & personalization" },
    description: {
      en: "High-resolution DTG/DTF printing on demand.",
      vi: "In DTG/DTF độ phân giải cao theo yêu cầu.",
      zh: "按需高分辨率DTG/DTF打印。",
    },
  },
  {
    position: 7,
    key: "advisory",
    title: { en: "Consultation", vi: "Tư vấn", zh: "Consultation" },
    description: {
      en: "Advice tailored to your product type and specific needs.",
      vi: "Tư vấn theo loại sản phẩm và nhu cầu cụ thể.",
      zh: "根据您的产品类型与具体需求提供咨询。",
    },
  },
];

// section_copy roles are scalar: the landing reads `.title` for consult-heading and `.description`
// for consult-intro / hub-caption, so the unused side is intentionally left blank.
const EMPTY: Trio = { en: "", vi: "", zh: "" };
const sectionCopy: Block[] = [
  {
    position: 1,
    key: "consult-heading",
    title: { en: "Open an operations file.", vi: "Mở hồ sơ vận hành.", zh: "开启运营档案。" },
    description: EMPTY,
  },
  {
    position: 2,
    key: "consult-intro",
    title: EMPTY,
    description: {
      en: "No automated quotes. Describe your product and needs — the THG team designs the right operational flow and contacts you directly.",
      vi: "Không cấp báo giá tự động. Mô tả sản phẩm và nhu cầu — đội ngũ THG sẽ thiết kế luồng vận hành phù hợp và liên hệ trực tiếp.",
      zh: "不提供自动报价。描述您的产品与需求——THG团队将设计合适的运营流程并直接联系您。",
    },
  },
  {
    position: 3,
    key: "hub-caption",
    title: EMPTY,
    description: {
      en: "Hub System surfaces status at each processing stage for your operations team.",
      vi: "Hub System hiển thị trạng thái theo từng bước xử lý cho đội vận hành của bạn.",
      zh: "Hub System 在每个处理阶段向您的运营团队显示状态。",
    },
  },
];

const BUNDLES: KindBundle[] = [
  { kind: "journey_step", blocks: journey },
  { kind: "capability", blocks: capability },
  { kind: "section_copy", blocks: sectionCopy },
];

const LOCALES = ["en", "vi", "zh"] as const;
type Locale = (typeof LOCALES)[number];

/** SQLite single-quoted literal with CHAR(10) joins to keep newlines portable. */
function sqlLiteral(s: string): string {
  const escaped = s.replace(/'/g, "''");
  const parts = escaped.split("\n");
  if (parts.length === 1) return `'${parts[0]}'`;
  return parts.map((p) => `'${p}'`).join(" || CHAR(10) || ");
}

const lines: string[] = [];
lines.push(
  "-- Seed generic service_blocks for /thg-fulfill. Generated by db/seeds/fulfill-service-blocks.ts.",
);
lines.push(
  "-- Content mirrored verbatim from the merged Next landing fallback (localized-content.ts).",
);
lines.push(
  "-- Re-runnable: DELETE cascades service_block_translations; rows + reviewed EN/ZH are re-created.",
);
lines.push("");
lines.push("DELETE FROM service_blocks WHERE page_slug = 'thg-fulfill';");
lines.push("");

for (const bundle of BUNDLES) {
  lines.push(`-- kind: ${bundle.kind}`);
  for (const block of bundle.blocks) {
    const payloadJson = JSON.stringify({ key: block.key });
    for (const locale of LOCALES) {
      lines.push(
        `INSERT INTO service_blocks (page_slug, kind, position, locale, icon, title, description, payload_json) VALUES (` +
          `'thg-fulfill', '${bundle.kind}', ${block.position}, '${locale}', NULL, ` +
          `${sqlLiteral(block.title[locale as Locale])}, ` +
          `${sqlLiteral(block.description[locale as Locale])}, ` +
          `${sqlLiteral(payloadJson)});`,
      );
    }
    lines.push("");
  }
}

// EN/ZH reviewed translations, resolved from the just-inserted en/zh source rows against their VI
// sibling (mirrors migration 0020's human-reviewed backfill: source_hash '', reviewed, VI source,
// AI columns NULL). Self-contained so a re-run restores translations without re-running 0020.
lines.push("-- Reviewed EN/ZH translations (self-contained backfill; parity with migration 0020).");
lines.push(`INSERT INTO service_block_translations (
  service_block_id, locale, title, description, payload_json,
  status, source_locale, source_hash, reviewed_at
)
SELECT
  vi.id, sb.locale, sb.title, sb.description, sb.payload_json,
  'reviewed', 'vi', '', unixepoch()
FROM service_blocks sb
JOIN service_blocks vi
  ON vi.page_slug = sb.page_slug AND vi.kind = sb.kind
 AND vi.position = sb.position AND vi.locale = 'vi'
WHERE sb.page_slug = 'thg-fulfill' AND sb.locale IN ('en', 'zh')
  AND NOT EXISTS (
    SELECT 1 FROM service_block_translations t
     WHERE t.service_block_id = vi.id AND t.locale = sb.locale
  );`);
lines.push("");

process.stdout.write(lines.join("\n") + "\n");
