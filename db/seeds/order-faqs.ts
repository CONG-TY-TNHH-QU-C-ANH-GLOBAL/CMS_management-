// Generates the SQL seed for the /thg-order FAQ section (scope=order).
// Source text is mirrored from THG_landingpage/src/lib/i18n.tsx so the public
// page renders the exact same copy regardless of whether the CMS row exists
// or the static fallback fires.
//
// Run:
//   bun run db/seeds/order-faqs.ts                  # emits SQL to stdout
//   bun run db/seeds/order-faqs.ts | tee out.sql    # save to file
//   bunx wrangler d1 execute thg-cms --remote --file=out.sql
//
// Idempotency: starts with `DELETE FROM faqs WHERE scope = 'order'` so re-runs
// replace prior order-scope rows rather than duplicating positions.

interface FaqRow {
  position: number;
  question: { en: string; vi: string; zh: string };
  answer: { en: string; vi: string; zh: string };
}

const FAQS: FaqRow[] = [
  {
    position: 1,
    question: {
      en: "How do I start ordering through THG?",
      vi: "Tôi cần làm gì để bắt đầu đặt hàng qua THG?",
      zh: "如何开始通过THG订购？",
    },
    answer: {
      en: "Simple! Just copy the product link from Taobao, 1688, or Pinduoduo and send it to us via Facebook. THG will verify the supplier, quote an all-in price, and guide you through each step.",
      vi: "Rất đơn giản! Copy link sản phẩm từ Taobao, 1688 hoặc Pinduoduo gửi cho chúng tôi qua Facebook. THG sẽ kiểm tra nhà cung cấp, báo giá trọn gói và hướng dẫn từng bước.",
      zh: "很简单!复制淘宝、1688或拼多多的商品链接,通过Facebook发给我们。THG将验证供应商、报全包价并逐步指导您。",
    },
  },
  {
    position: 2,
    question: {
      en: "How long does shipping from China to USA take?",
      vi: "Thời gian từ lúc đặt hàng đến khi nhận hàng tại Mỹ mất bao lâu?",
      zh: "从中国到美国的运输需要多长时间?",
    },
    answer: {
      en: "• Standard Air (Epacket): 6–12 Business Days\n• Express Air (DHL/FedEx): 3–5 Business Days\n• Sea Freight (Bulk): 20–25 Business Days\n\nVs. routing through Vietnam, you save 3–4 extra weeks and $150–300.",
      vi: "• Hàng không thường (Epacket): 6–12 Ngày LV\n• Hàng không nhanh (DHL/FedEx): 3–5 Ngày LV\n• Hàng lô đường biển: 20–25 Ngày LV\n\nSo với đi vòng qua Việt Nam, bạn tiết kiệm 3–4 tuần và $150–300.",
      zh: "• 标准空运(Epacket): 6-12个工作日\n• 快速空运(DHL/FedEx): 3-5个工作日\n• 海运(散货): 20-25个工作日\n\n比经越南中转节省3-4周和$150-300。",
    },
  },
  {
    position: 3,
    question: {
      en: "How do I pay THG from the USA?",
      vi: "Tôi ở Mỹ thanh toán cho THG bằng cách nào?",
      zh: "在美国如何付款给THG?",
    },
    answer: {
      en: "• PayPal (most common for US-based customers)\n• Pingpong / Payoneer / WorldFirst\n• VND bank transfer\n• Zelle / Venmo (USD)\n\nPayment: 50% deposit when confirming, 50% balance when ready to ship.",
      vi: "• PayPal (phổ biến nhất với khách tại Mỹ)\n• Pingpong / Payoneer / WorldFirst\n• Chuyển khoản VND\n• Zelle / Venmo (USD)\n\nQuy trình: Đặt cọc 50% khi xác nhận, thanh toán 50% còn lại khi hàng sẵn sàng ship.",
      zh: "• PayPal(美国客户最常用)\n• Pingpong/Payoneer/WorldFirst\n• 越南盾银行转账\n• Zelle/Venmo (USD)\n\n付款:确认时预付50%,发货前付清余款。",
    },
  },
  {
    position: 4,
    question: {
      en: "What if my goods arrive defective or don't match the description?",
      vi: "Nếu hàng về bị lỗi hoặc không đúng mô tả, THG xử lý như thế nào?",
      zh: "如果收到的商品有缺陷或与描述不符怎么办?",
    },
    answer: {
      en: "• All goods inspected and video-recorded before shipping\n• Defect found BEFORE shipping → THG exchanges or refunds with supplier\n• Defective after arrival → THG supports insurance claims\n\nYou NEVER have to contact the Chinese supplier directly.",
      vi: "• Tất cả hàng được kiểm tra và quay video trước khi ship\n• Phát hiện lỗi TRƯỚC khi ship → THG đổi hàng hoặc hoàn tiền\n• Hàng lỗi SAU khi đến Mỹ → THG hỗ trợ bảo hiểm và bồi thường\n\nBạn KHÔNG BAO GIỜ phải tự liên hệ nhà cung cấp.",
      zh: "• 发货前所有商品进行检查和录像\n• 发货前发现缺陷 → THG与供应商换货或退款\n• 到达后有缺陷 → THG支持保险索赔\n\n您永远不需要直接联系中国供应商。",
    },
  },
  {
    position: 5,
    question: {
      en: "Will I have to pay US customs / import tax?",
      vi: "Hàng có bị thuế hải quan khi nhập vào Mỹ không?",
      zh: "需要缴纳美国海关/进口税吗?",
    },
    answer: {
      en: "• Epacket Yun Express: Tax INCLUDED in shipping price\n• Standard Epacket: THG handles tax declaration\n• Bulk Sea: US customs collects duty from recipient\n\nTHG advises best lane for your goods to minimize customs costs.",
      vi: "• Epacket Yun Express: Thuế đã BAO GỒM trong giá ship\n• Epacket thường: THG xử lý khai báo thuế\n• Hàng lô đường biển: Hải quan Mỹ thu trực tiếp từ người nhận\n\nTHG sẽ tư vấn kênh tốt nhất để tối thiểu hóa chi phí hải quan.",
      zh: "• Epacket云途:运费已含税\n• 标准Epacket: THG处理报关\n• 散货海运:美国海关向收件人征收关税\n\nTHG建议最佳渠道以最小化海关费用。",
    },
  },
  {
    position: 6,
    question: {
      en: "Can THG find and compare products for me from multiple suppliers?",
      vi: "THG có thể tìm và so sánh sản phẩm tốt nhất từ nhiều nhà cung cấp không?",
      zh: "THG能帮我从多个供应商找到并比较产品吗?",
    },
    answer: {
      en: "Absolutely! THG searches Taobao, 1688, and Pinduoduo, compares 3–5 suppliers, verifies ratings & quality in Mandarin, and presents a quoted comparison. This sourcing service is 100% FREE.",
      vi: "Hoàn toàn có! THG tìm trên Taobao, 1688, Pinduoduo và so sánh 3–5 nhà cung cấp, kiểm tra đánh giá bằng tiếng Trung. Dịch vụ tìm hàng này 100% MIỄN PHÍ.",
      zh: "当然!THG搜索淘宝、1688和拼多多,比较3-5个供应商,用中文验证评分和质量,提供报价比较。此采购服务100%免费。",
    },
  },
  {
    position: 7,
    question: {
      en: "Where are THG's warehouses? Can I pick up in Pennsylvania?",
      vi: "THG có kho ở đâu? Tôi ở Pennsylvania có thể lấy hàng không?",
      zh: "THG的仓库在哪里?可以在宾州自提吗?",
    },
    answer: {
      en: "THG operates 3 locations:\n• 🇻🇳 Vietnam: 121/5 Kenh 19/5 St., Son Ky, Tan Phu, HCMC\n• 🇨🇳 China: Dongguan, Guangdong\n• 🇺🇸 USA: 108 Almond CT, Milford, PA 18337\n\nCustomers near PA can arrange direct pickup.",
      vi: "THG có 3 địa điểm:\n• 🇻🇳 Việt Nam: 121/5 Đ. Kênh 19/5, Sơn Kỳ, Tân Phú, TP.HCM\n• 🇨🇳 Trung Quốc: Đông Hoản, Quảng Đông\n• 🇺🇸 Mỹ: 108 Almond CT, Milford, PA 18337\n\nKhách gần PA có thể đến lấy hàng trực tiếp.",
      zh: "THG运营3个地点:\n• 🇻🇳 越南:胡志明市新富区\n• 🇨🇳 中国:广东东莞\n• 🇺🇸 美国:108 Almond CT, Milford, PA 18337\n\n宾州附近的客户可以安排自提。",
    },
  },
];

const LOCALES = ["en", "vi", "zh"] as const;

/** Escapes a single string value for safe inclusion in a SQLite literal.
 *  - single-quote is doubled (`'` → `''`)
 *  - newlines are replaced by `' || CHAR(10) || '` so the resulting SQL
 *    works regardless of how the runner handles multi-line literals. */
function sqlLiteral(s: string): string {
  const escaped = s.replace(/'/g, "''");
  // Split on newline so each chunk becomes its own single-quoted segment
  // joined by CHAR(10). Empty leading/trailing chunks are preserved so an
  // initial or trailing newline still produces one.
  const parts = escaped.split("\n");
  if (parts.length === 1) return `'${parts[0]}'`;
  return parts.map((p) => `'${p}'`).join(" || CHAR(10) || ");
}

const lines: string[] = [];
lines.push("-- Seed FAQs for /thg-order (scope='order'). Generated by db/seeds/order-faqs.ts.");
lines.push("-- Re-runnable: replaces existing scope='order' rows.");
lines.push("");
lines.push("DELETE FROM faqs WHERE scope = 'order';");
lines.push("");

for (const faq of FAQS) {
  for (const locale of LOCALES) {
    lines.push(
      `INSERT INTO faqs (scope, position, locale, question, answer) VALUES (` +
        `'order', ${faq.position}, '${locale}', ` +
        `${sqlLiteral(faq.question[locale])}, ` +
        `${sqlLiteral(faq.answer[locale])});`,
    );
  }
  lines.push("");
}

process.stdout.write(lines.join("\n") + "\n");
