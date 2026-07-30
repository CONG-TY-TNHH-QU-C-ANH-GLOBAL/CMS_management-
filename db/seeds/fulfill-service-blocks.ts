// Generates the SQL seed for /thg-fulfill service_blocks (journey_step, capability, section_copy).
// Content is mirrored VERBATIM from the merged Next landing fallback
// (THG_landingpage next/src/features/fulfill/localized-content.ts) — a source-of-truth migration,
// not a copywriting change. The landing binds each block by payload.key (never id/position/order).
//
// Run:
//   bun run db/seeds/fulfill-service-blocks.ts > db/seeds/fulfill-service-blocks.sql
//   bunx wrangler d1 execute thg-cms --remote --file=db/seeds/fulfill-service-blocks.sql
//
// The emitted SQL is SET-BASED: two transient staging tables hold the managed dataset, and a single
// anti-join INSERT creates VI rows / EN·ZH reviewed translations that are missing — no per-role
// statement repetition, no repeated EXISTS. It is non-destructive (create-if-missing: no page-wide
// DELETE), self-checking (CHECK-constraint preflight/postflight that abort wrangler non-zero), and
// review-safe (a reviewed translation is attached ONLY when the VI source still matches canonical).
import { computeSourceHash } from "../../src/features/translations/translations.hash";

type Trio = { en: string; vi: string; zh: string };

interface Block {
  position: number;
  /** Canonical, immutable landing role key → payload.key. */
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

const PAGE_SLUG = "thg-fulfill";
/** The kinds this seed owns — all managed roles live under these; unrelated blocks use other kinds. */
const MANAGED_KINDS = ["journey_step", "capability", "section_copy"] as const;

interface RoleRow {
  kind: string;
  key: string;
  position: number;
  viTitle: string;
  viDescription: string;
  payload: string;
}
interface TransRow {
  kind: string;
  key: string;
  locale: "en" | "zh";
  title: string;
  description: string;
  sourceHash: string;
}

/** Flatten the bundles into the managed-role + translation datasets, computing each role's canonical
 *  source_hash (of its VI {title, description, payload_json}) via the repository's hashing function. */
async function buildData(): Promise<{ roles: RoleRow[]; trans: TransRow[] }> {
  const roles: RoleRow[] = [];
  const trans: TransRow[] = [];
  for (const bundle of BUNDLES) {
    for (const block of bundle.blocks) {
      const payload = JSON.stringify({ key: block.key });
      const sourceHash = await computeSourceHash({
        title: block.title.vi,
        description: block.description.vi,
        payload_json: payload,
      });
      roles.push({
        kind: bundle.kind,
        key: block.key,
        position: block.position,
        viTitle: block.title.vi,
        viDescription: block.description.vi,
        payload,
      });
      for (const locale of ["en", "zh"] as const) {
        trans.push({
          kind: bundle.kind,
          key: block.key,
          locale,
          title: block.title[locale],
          description: block.description[locale],
          sourceHash,
        });
      }
    }
  }
  return { roles, trans };
}

// ── SQL emit helpers ─────────────────────────────────────────────────────────────────────────

/** SQLite single-quoted literal with CHAR(10) joins to keep newlines portable. */
function lit(s: string): string {
  const parts = s.replace(/'/g, "''").split("\n");
  return parts.length === 1 ? `'${parts[0]}'` : parts.map((p) => `'${p}'`).join(" || CHAR(10) || ");
}

/** `(v1, v2, …)` VALUES tuple. */
function tuple(values: string[]): string {
  return `  (${values.join(", ")})`;
}

const kindsInList = MANAGED_KINDS.map((k) => `'${k}'`).join(", ");
const KEY_PATH = "'$.key'";

function emitHeader(): string {
  return [
    "-- ============================================================================================",
    "-- Managed service_blocks seed for /thg-fulfill. GENERATED by db/seeds/fulfill-service-blocks.ts.",
    "-- Do not hand-edit; change the generator and regenerate.",
    "--",
    "-- OWNERSHIP — this seed owns ONLY these 14 roles, keyed by (page_slug, kind, payload.key):",
    "--   journey_step: design-input, processing, quality-assurance, dispatch-ready",
    "--   capability:   network, qc, pack, hub, intake, print, advisory",
    "--   section_copy: consult-heading, consult-intro, hub-caption",
    "-- It NEVER deletes: unrelated thg-fulfill blocks (pain_point, solution, policy, resource, future",
    "-- kinds) and their translations are untouched. Ownership boundary = (page_slug, kind, payload.key).",
    "--",
    "-- POLICY = create-if-missing: a role is inserted only when absent, so editor edits to managed",
    "-- roles survive rerun; a role an editor deleted is re-created. Rerun is a no-op once complete.",
    "--",
    "-- REVIEW SAFETY: an EN/ZH reviewed translation is attached ONLY when the existing VI row still",
    "-- matches the canonical seed source. If an editor changed the VI text, no reviewed translation is",
    "-- created against stale copy (source_hash = canonical computeSourceHash; the public endpoint only",
    "-- exposes status='reviewed').",
    "--",
    "-- SELF-CHECKING + ATOMIC: preflight aborts (non-zero) BEFORE any write if a managed identity is",
    "-- already duplicated; postflight aborts after writes if the managed shape is wrong. Both use a",
    "-- CHECK constraint so wrangler stops the rollout. `wrangler d1 execute --file` runs this whole",
    "-- file as ONE atomic D1 transaction (verified: a mid-file failure rolls back every domain write",
    "-- AND the staging tables) — a failed preflight/postflight leaves the database exactly as before.",
    "--",
    "-- SERIALIZATION — read before running:",
    "--   • EN/ZH translations are DB-enforced unique: service_block_translations UNIQUE(service_block_id,",
    "--     locale) makes a duplicate impossible.",
    "--   • VI-row uniqueness is OPERATIONALLY protected, NOT database-enforced: service_blocks has no",
    "--     unique index on (page_slug, kind, payload.key), and adding a cross-page expression index is",
    "--     an unjustified schema change for this bootstrap batch.",
    "--   • Therefore: run this seed ONCE, by ONE designated operator. Concurrent execution is PROHIBITED",
    "--     (two truly-parallel runs could each pass the anti-join before either commits a VI row).",
    "--   • The duplicate preflight and the postflight assertions remain MANDATORY — do not strip them.",
    "--   No CI workflow runs seed files today (db-migrate.yml is workflow_dispatch for MIGRATIONS only,",
    "--   with no concurrency group / environment approval); apply manually, serially:",
    "--   bunx wrangler d1 execute thg-cms --remote --file=db/seeds/fulfill-service-blocks.sql",
    "-- ============================================================================================",
  ].join("\n");
}

function emitStaging(roles: RoleRow[], trans: TransRow[]): string {
  const roleValues = roles
    .map((r) =>
      tuple([
        lit(r.kind),
        lit(r.key),
        String(r.position),
        lit(r.viTitle),
        lit(r.viDescription),
        lit(r.payload),
      ]),
    )
    .join(",\n");
  const transValues = trans
    .map((t) =>
      tuple([
        lit(t.kind),
        lit(t.key),
        lit(t.locale),
        lit(t.title),
        lit(t.description),
        lit(t.sourceHash),
      ]),
    )
    .join(",\n");
  return [
    "-- Transient staging datasets (D1 blocks TEMP tables, so these are regular tables, dropped at end).",
    "DROP TABLE IF EXISTS _seed_fulfill_roles;",
    "CREATE TABLE _seed_fulfill_roles (kind TEXT, role_key TEXT, position INTEGER, vi_title TEXT, vi_description TEXT, payload TEXT);",
    `INSERT INTO _seed_fulfill_roles (kind, role_key, position, vi_title, vi_description, payload) VALUES\n${roleValues};`,
    "",
    "DROP TABLE IF EXISTS _seed_fulfill_trans;",
    "CREATE TABLE _seed_fulfill_trans (kind TEXT, role_key TEXT, locale TEXT, title TEXT, description TEXT, source_hash TEXT);",
    `INSERT INTO _seed_fulfill_trans (kind, role_key, locale, title, description, source_hash) VALUES\n${transValues};`,
  ].join("\n");
}

function emitPreflight(): string {
  // Sum of (rows_in_group - 1) across managed VI identities and per-(block,locale) translations:
  // >0 iff some managed identity is already duplicated. CHECK(dupes=0) aborts before any seed write.
  return [
    "-- PREFLIGHT — abort (before writes) if a managed identity is already duplicated.",
    "DROP TABLE IF EXISTS _seed_fulfill_preflight;",
    "CREATE TABLE _seed_fulfill_preflight (dupes INTEGER NOT NULL CHECK (dupes = 0));",
    "INSERT INTO _seed_fulfill_preflight (dupes)",
    "SELECT COALESCE(SUM(extra), 0) FROM (",
    `  SELECT COUNT(*) - 1 AS extra FROM service_blocks`,
    `   WHERE page_slug = '${PAGE_SLUG}' AND locale = 'vi' AND kind IN (${kindsInList})`,
    `   GROUP BY kind, json_extract(payload_json, ${KEY_PATH})`,
    "  UNION ALL",
    "  SELECT COUNT(*) - 1 AS extra FROM service_block_translations t",
    "    JOIN service_blocks sb ON sb.id = t.service_block_id",
    `   WHERE sb.page_slug = '${PAGE_SLUG}' AND sb.locale = 'vi' AND sb.kind IN (${kindsInList})`,
    "     AND t.locale IN ('en', 'zh')",
    "   GROUP BY sb.id, t.locale",
    ");",
    "DROP TABLE IF EXISTS _seed_fulfill_preflight;",
  ].join("\n");
}

function emitRoleInsert(): string {
  // Set-based create-if-missing: anti-join the managed roles against existing VI rows by identity.
  return [
    "-- VI rows — one set-based anti-join insert (create-if-missing; preserves editor-modified roles).",
    "INSERT INTO service_blocks (page_slug, kind, position, locale, icon, title, description, payload_json)",
    `SELECT '${PAGE_SLUG}', r.kind, r.position, 'vi', NULL, r.vi_title, r.vi_description, r.payload`,
    "FROM _seed_fulfill_roles r",
    "LEFT JOIN service_blocks sb",
    `  ON sb.page_slug = '${PAGE_SLUG}' AND sb.kind = r.kind AND sb.locale = 'vi'`,
    `  AND json_extract(sb.payload_json, ${KEY_PATH}) = r.role_key`,
    "WHERE sb.id IS NULL;",
  ].join("\n");
}

function emitTranslationInsert(): string {
  // Set-based create-if-missing for EN/ZH reviewed translations. The `sb.title=r.vi_title AND …`
  // predicate is the REVIEW-SAFETY gate: attach a reviewed translation only when the live VI source
  // still equals canonical, so an editor-edited VI never gets a stale reviewed translation.
  return [
    "-- EN/ZH reviewed translations — one set-based insert; review-safe (canonical VI only), create-if-missing.",
    "INSERT INTO service_block_translations (service_block_id, locale, title, description, payload_json, status, source_locale, source_hash, reviewed_at)",
    "SELECT sb.id, tr.locale, tr.title, tr.description, r.payload, 'reviewed', 'vi', tr.source_hash, unixepoch()",
    "FROM _seed_fulfill_trans tr",
    "JOIN _seed_fulfill_roles r ON r.kind = tr.kind AND r.role_key = tr.role_key",
    "JOIN service_blocks sb",
    `  ON sb.page_slug = '${PAGE_SLUG}' AND sb.kind = tr.kind AND sb.locale = 'vi'`,
    `  AND json_extract(sb.payload_json, ${KEY_PATH}) = tr.role_key`,
    "  AND sb.title = r.vi_title AND sb.description = r.vi_description AND sb.payload_json = r.payload",
    "LEFT JOIN service_block_translations t ON t.service_block_id = sb.id AND t.locale = tr.locale",
    "WHERE t.id IS NULL;",
  ].join("\n");
}

function emitPostflight(): string {
  // violations = managed roles not present exactly once (P1) + duplicate EN/ZH per block (P2)
  //            + blocks whose reviewed EN count != reviewed ZH count (P3: pair integrity; 0=0 is fine
  //              for an editor-edited role whose translations were safely skipped). CHECK aborts non-zero.
  return [
    "-- POSTFLIGHT — abort (non-zero) if the managed shape is wrong after writes.",
    "DROP TABLE IF EXISTS _seed_fulfill_postflight;",
    "CREATE TABLE _seed_fulfill_postflight (violations INTEGER NOT NULL CHECK (violations = 0));",
    "INSERT INTO _seed_fulfill_postflight (violations) SELECT",
    "  (SELECT COUNT(*) FROM _seed_fulfill_roles r WHERE (",
    `     SELECT COUNT(*) FROM service_blocks sb WHERE sb.page_slug = '${PAGE_SLUG}' AND sb.locale = 'vi'`,
    `      AND sb.kind = r.kind AND json_extract(sb.payload_json, ${KEY_PATH}) = r.role_key) <> 1)`,
    "  + (SELECT COUNT(*) FROM (SELECT 1 FROM service_block_translations t",
    "       JOIN service_blocks sb ON sb.id = t.service_block_id",
    `      WHERE sb.page_slug = '${PAGE_SLUG}' AND sb.locale = 'vi' AND sb.kind IN (${kindsInList})`,
    "        AND t.locale IN ('en', 'zh') GROUP BY sb.id, t.locale HAVING COUNT(*) > 1))",
    `  + (SELECT COUNT(*) FROM service_blocks sb WHERE sb.page_slug = '${PAGE_SLUG}' AND sb.locale = 'vi'`,
    `      AND sb.kind IN (${kindsInList}) AND (`,
    "        (SELECT COUNT(*) FROM service_block_translations t WHERE t.service_block_id = sb.id AND t.locale = 'en' AND t.status = 'reviewed')",
    "        <> (SELECT COUNT(*) FROM service_block_translations t WHERE t.service_block_id = sb.id AND t.locale = 'zh' AND t.status = 'reviewed')));",
    "DROP TABLE IF EXISTS _seed_fulfill_postflight;",
  ].join("\n");
}

function emitCleanup(): string {
  return [
    "-- Drop staging datasets.",
    "DROP TABLE IF EXISTS _seed_fulfill_roles;",
    "DROP TABLE IF EXISTS _seed_fulfill_trans;",
  ].join("\n");
}

const { roles, trans } = await buildData();
const sql = [
  emitHeader(),
  emitStaging(roles, trans),
  emitPreflight(),
  emitRoleInsert(),
  emitTranslationInsert(),
  emitPostflight(),
  emitCleanup(),
].join("\n\n");
process.stdout.write(sql + "\n");
