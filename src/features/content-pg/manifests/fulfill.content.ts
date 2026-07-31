// Versioned, NON-EXECUTABLE content manifest — the 14 low-risk THG Fulfill roles preserved from the
// superseded PR #70 seed. This is IMPORTER INPUT, not SQL: it is validated through the kind registry
// and imported transactionally by the content importer against the PostgreSQL data plane. Text is
// mirrored verbatim from the merged Next landing fallback (localized-content.ts); nothing runs on load.
import type { Kind } from "../content.kinds";

export interface ManifestLocalized {
  title: string | null;
  description: string | null;
  translatedPayload: Record<string, unknown>;
}

export interface ManifestBlock {
  kind: Kind;
  blockKey: string;
  position: number;
  coreConfig: Record<string, unknown>;
  /** VI is the source; EN/ZH are reviewed translations of it. */
  localizations: Record<"vi" | "en" | "zh", ManifestLocalized>;
}

export interface ContentManifest {
  version: string;
  pageSlug: string;
  sourceLocale: "vi";
  provenance: string;
  blocks: ManifestBlock[];
}

const t = (title: string | null, description: string | null): ManifestLocalized => ({
  title,
  description,
  translatedPayload: {},
});

export const FULFILL_CONTENT_MANIFEST: ContentManifest = {
  version: "2026-07-31.1",
  pageSlug: "thg-fulfill",
  sourceLocale: "vi",
  provenance:
    "PR#70 fulfill-service-blocks seed → merged landing localized-content.ts (low-risk batch)",
  blocks: [
    {
      kind: "journey_step",
      blockKey: "design-input",
      position: 1,
      coreConfig: {},
      localizations: {
        vi: t(
          "Design Input",
          "Tiếp nhận sản phẩm & file thiết kế, gắn định danh (ID) vận hành cho từng đơn vị.",
        ),
        en: t(
          "Design Input",
          "Receive products and design files, assigning an operational ID to every unit.",
        ),
        zh: t("Design Input", "接收产品与设计文件，为每个单元分配运营ID。"),
      },
    },
    {
      kind: "journey_step",
      blockKey: "processing",
      position: 2,
      coreConfig: {},
      localizations: {
        vi: t("Processing · POD", "In POD (DTG/DTF) độ phân giải cao tại VN · CN · US."),
        en: t(
          "Processing · POD",
          "High-resolution POD printing (DTG/DTF) in Vietnam, China and the US.",
        ),
        zh: t("Processing · POD", "在越南·中国·美国进行高分辨率POD打印（DTG/DTF）。"),
      },
    },
    {
      kind: "journey_step",
      blockKey: "quality-assurance",
      position: 3,
      coreConfig: {},
      localizations: {
        vi: t(
          "Quality Assurance",
          "QC từng đơn: định dạng, màu sắc, chất lượng in — chuẩn TMĐT Mỹ.",
        ),
        en: t(
          "Quality Assurance",
          "Item-level QC: file format, color and print quality — to US eCommerce standard.",
        ),
        zh: t("Quality Assurance", "逐单质检：文件格式、颜色与印刷质量——达到美国电商标准。"),
      },
    },
    {
      kind: "journey_step",
      blockKey: "dispatch-ready",
      position: 4,
      coreConfig: {},
      localizations: {
        vi: t("Dispatch Ready", "Đóng gói chuẩn quy cách, dán nhãn vận chuyển + tracking."),
        en: t("Dispatch Ready", "Standards-compliant packing with a shipping label and tracking."),
        zh: t("Dispatch Ready", "按规范包装，贴运输标签并提供追踪。"),
      },
    },
    {
      kind: "capability",
      blockKey: "network",
      position: 1,
      coreConfig: {},
      localizations: {
        vi: t(
          "Cross-border network",
          "Xưởng POD tại VN · CN và fulfill nội địa US — định tuyến theo sản phẩm & điểm đến.",
        ),
        en: t(
          "Cross-border network",
          "POD workshops in VN · CN and US domestic fulfillment — routed by product and destination.",
        ),
        zh: t("Cross-border network", "越南·中国的POD车间与美国本土履约——按产品与目的地路由。"),
      },
    },
    {
      kind: "capability",
      blockKey: "qc",
      position: 2,
      coreConfig: {},
      localizations: {
        vi: t("Item-level QC", "Kiểm tra chất lượng từng đơn trước khi đóng gói."),
        en: t("Item-level QC", "Quality-checking every order before it is packed."),
        zh: t("Item-level QC", "在包装前检查每一个订单的质量。"),
      },
    },
    {
      kind: "capability",
      blockKey: "pack",
      position: 3,
      coreConfig: {},
      localizations: {
        vi: t("Đóng gói chuẩn Mỹ", "Đóng gói chuẩn TMĐT Mỹ, dán nhãn + tracking."),
        en: t("US standard packing", "US eCommerce-standard packing with label and tracking."),
        zh: t("US standard packing", "美国电商标准包装，附标签与追踪。"),
      },
    },
    {
      kind: "capability",
      blockKey: "hub",
      position: 4,
      coreConfig: {},
      localizations: {
        vi: t(
          "Hub System",
          "Trạng thái đơn hàng & sản phẩm hiển thị theo từng bước — không cần dò file thủ công.",
        ),
        en: t(
          "Hub System",
          "Order and product status visible step by step — no manual file digging.",
        ),
        zh: t("Hub System", "订单与产品状态按步骤可见——无需手动翻查文件。"),
      },
    },
    {
      kind: "capability",
      blockKey: "intake",
      position: 5,
      coreConfig: {},
      localizations: {
        vi: t("Tiếp nhận & định danh", "Tiếp nhận sản phẩm & file, gắn định danh vận hành."),
        en: t("Intake & ID", "Receiving products and files, assigning an operational ID."),
        zh: t("Intake & ID", "接收产品与文件，分配运营标识。"),
      },
    },
    {
      kind: "capability",
      blockKey: "print",
      position: 6,
      coreConfig: {},
      localizations: {
        vi: t("POD & cá nhân hóa", "In DTG/DTF độ phân giải cao theo yêu cầu."),
        en: t("POD & personalization", "High-resolution DTG/DTF printing on demand."),
        zh: t("POD & personalization", "按需高分辨率DTG/DTF打印。"),
      },
    },
    {
      kind: "capability",
      blockKey: "advisory",
      position: 7,
      coreConfig: {},
      localizations: {
        vi: t("Tư vấn", "Tư vấn theo loại sản phẩm và nhu cầu cụ thể."),
        en: t("Consultation", "Advice tailored to your product type and specific needs."),
        zh: t("Consultation", "根据您的产品类型与具体需求提供咨询。"),
      },
    },
    {
      kind: "section_copy",
      blockKey: "consult-heading",
      position: 1,
      coreConfig: {},
      localizations: {
        vi: t("Mở hồ sơ vận hành.", null),
        en: t("Open an operations file.", null),
        zh: t("开启运营档案。", null),
      },
    },
    {
      kind: "section_copy",
      blockKey: "consult-intro",
      position: 2,
      coreConfig: {},
      localizations: {
        vi: t(
          null,
          "Không cấp báo giá tự động. Mô tả sản phẩm và nhu cầu — đội ngũ THG sẽ thiết kế luồng vận hành phù hợp và liên hệ trực tiếp.",
        ),
        en: t(
          null,
          "No automated quotes. Describe your product and needs — the THG team designs the right operational flow and contacts you directly.",
        ),
        zh: t(
          null,
          "不提供自动报价。描述您的产品与需求——THG团队将设计合适的运营流程并直接联系您。",
        ),
      },
    },
    {
      kind: "section_copy",
      blockKey: "hub-caption",
      position: 3,
      coreConfig: {},
      localizations: {
        vi: t(
          null,
          "Hub System hiển thị trạng thái theo từng bước xử lý cho đội vận hành của bạn.",
        ),
        en: t(
          null,
          "Hub System surfaces status at each processing stage for your operations team.",
        ),
        zh: t(null, "Hub System 在每个处理阶段向您的运营团队显示状态。"),
      },
    },
  ],
};
