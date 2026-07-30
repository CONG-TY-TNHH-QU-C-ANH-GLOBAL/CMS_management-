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
// NON-DESTRUCTIVE / create-if-missing: there is NO page-wide delete. Each of the 14 managed roles
// (see OWNERSHIP in the emitted SQL) is inserted only when absent — VI row keyed by
// (page_slug, kind, payload.key), EN/ZH as reviewed service_block_translations. Rerun is a no-op
// once seeded; it preserves editor edits to managed roles AND every unrelated thg-fulfill block
// (pain_point / solution / policy / resource / future kinds) and their translations. This diverges
// from the older order seed (page-wide DELETE) precisely because ownership now moves into the CMS.

// Reuse the canonical stale-detection hash (docs/ai-localization-spec.md §3.2) so a seeded reviewed
// translation stores the SAME source_hash the update handler recomputes — future VI edits mark EN/ZH
// stale iff the content actually changed (an empty hash would falsely stale on the first edit).
import { computeSourceHash } from "../../src/features/translations/translations.hash";

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

/** SQLite single-quoted literal with CHAR(10) joins to keep newlines portable. */
function sqlLiteral(s: string): string {
  const escaped = s.replace(/'/g, "''");
  const parts = escaped.split("\n");
  if (parts.length === 1) return `'${parts[0]}'`;
  return parts.map((p) => `'${p}'`).join(" || CHAR(10) || ");
}

const KEY = "$.key";
const lines: string[] = [];
lines.push(
  "-- Seed managed service_blocks for /thg-fulfill. Generated by db/seeds/fulfill-service-blocks.ts.",
);
lines.push(
  "-- Content mirrored VERBATIM from the merged Next landing fallback (localized-content.ts).",
);
lines.push("--");
lines.push(
  "-- OWNERSHIP: this seed owns ONLY these 14 canonical roles, keyed by (page_slug,kind,payload.key):",
);
lines.push("--   journey_step: design-input, processing, quality-assurance, dispatch-ready");
lines.push("--   capability:   network, qc, pack, hub, intake, print, advisory");
lines.push("--   section_copy: consult-heading, consult-intro, hub-caption");
lines.push(
  "-- It NEVER deletes page-wide: unrelated thg-fulfill blocks (pain_point, solution, policy,",
);
lines.push("-- resource, future kinds) and their translations are untouched.");
lines.push("--");
lines.push(
  "-- POLICY = create-if-missing: a managed role is inserted only when absent, so later editor",
);
lines.push(
  "-- edits to these roles are preserved on rerun (source-of-truth now lives in the CMS). A role",
);
lines.push(
  "-- deleted by an editor is re-created. Idempotent: rerun is a no-op when all 14 already exist.",
);
lines.push("--");
lines.push(
  "-- Each block carries payload.key (the landing binds by key, never position/order). VI lives in",
);
lines.push(
  "-- service_blocks; EN/ZH are reviewed service_block_translations carrying the real source_hash.",
);
lines.push("");

for (const bundle of BUNDLES) {
  lines.push(`-- kind: ${bundle.kind}`);
  for (const block of bundle.blocks) {
    const payloadJson = JSON.stringify({ key: block.key });
    const payloadLit = sqlLiteral(payloadJson);
    // source_hash = hash of the VI source {title, description, payload_json} the update handler sees.
    const sourceHash = await computeSourceHash({
      title: block.title.vi,
      description: block.description.vi,
      payload_json: payloadJson,
    });
    // Match a managed role by its immutable (page_slug, kind, payload.key) — not id/position/title.
    const roleExists = (locale: string) =>
      `SELECT 1 FROM service_blocks WHERE page_slug='thg-fulfill' AND kind='${bundle.kind}' ` +
      `AND locale='${locale}' AND json_extract(payload_json,'${KEY}')='${block.key}'`;

    lines.push(`-- role: ${block.key}`);
    // VI source row — create-if-missing (preserves an editor-modified role).
    lines.push(
      `INSERT INTO service_blocks (page_slug, kind, position, locale, icon, title, description, payload_json)\n` +
        `SELECT 'thg-fulfill', '${bundle.kind}', ${block.position}, 'vi', NULL, ` +
        `${sqlLiteral(block.title.vi)}, ${sqlLiteral(block.description.vi)}, ${payloadLit}\n` +
        `WHERE NOT EXISTS (${roleExists("vi")});`,
    );
    // EN/ZH reviewed translations for THIS role's VI row — create-if-missing per (block, locale).
    for (const locale of ["en", "zh"] as const) {
      lines.push(
        `INSERT INTO service_block_translations (service_block_id, locale, title, description, payload_json, status, source_locale, source_hash, reviewed_at)\n` +
          `SELECT vi.id, '${locale}', ${sqlLiteral(block.title[locale])}, ${sqlLiteral(block.description[locale])}, ${payloadLit}, 'reviewed', 'vi', '${sourceHash}', unixepoch()\n` +
          `FROM service_blocks vi\n` +
          `WHERE vi.page_slug='thg-fulfill' AND vi.kind='${bundle.kind}' AND vi.locale='vi' AND json_extract(vi.payload_json,'${KEY}')='${block.key}'\n` +
          `  AND NOT EXISTS (SELECT 1 FROM service_block_translations t WHERE t.service_block_id=vi.id AND t.locale='${locale}');`,
      );
    }
    lines.push("");
  }
}

process.stdout.write(lines.join("\n") + "\n");
