// Generates the SQL seed for /thg-order generic service_blocks rows:
// pain_point, process_step, solution, shipping_lane, policy. Source text is
// mirrored from THG_landingpage/src/lib/i18n.tsx so the public page renders
// the exact same copy whether the CMS row exists or the static fallback fires.
//
// Run:
//   bun run db/seeds/order-service-blocks.ts                  # emits SQL to stdout
//   bun run db/seeds/order-service-blocks.ts > out.sql        # save to file
//   bunx wrangler d1 execute thg-cms --remote --file=out.sql
//
// Idempotency: starts with `DELETE FROM service_blocks WHERE page_slug='thg-order'`
// so re-runs replace prior order rows rather than duplicating positions.

type Trio = { en: string; vi: string; zh: string };

interface BaseBlock {
  position: number;
  icon: string | null;
  title: Trio;
  description: Trio;
  /** Extra fields encoded into payload_json. Strings inside Trio are localised
   *  per row; non-Trio values are emitted as-is for every locale. */
  payload?: Record<string, Trio | string | number | (string | Trio)[]>;
}

interface KindBundle {
  kind: string;
  blocks: BaseBlock[];
}

// ---- pain_point ---------------------------------------------------------

const painPoints: BaseBlock[] = [
  {
    position: 1,
    icon: "🔍",
    title: {
      en: "Can't find a trustworthy agent",
      vi: "Không tìm được đơn vị uy tín",
      zh: "找不到可信的代理",
    },
    description: {
      en: "Hundreds of services with no way to verify. One wrong choice and your money is gone.",
      vi: "Hàng trăm dịch vụ không biết ai thật ai giả. Chọn nhầm một lần là mất tiền oan.",
      zh: "数百种服务无法验证，选错一次钱就没了。",
    },
  },
  {
    position: 2,
    icon: "🈷️",
    title: {
      en: "Language barrier with Chinese suppliers",
      vi: "Rào cản ngôn ngữ với nhà cung cấp",
      zh: "与中国供应商的语言障碍",
    },
    description: {
      en: "Can't negotiate price, request quality specs, or handle complaints in Mandarin.",
      vi: "Không biết tiếng Trung, không thể thương lượng giá hay yêu cầu chất lượng với nhà cung cấp.",
      zh: "无法用中文议价、要求质量规格或处理投诉。",
    },
  },
  {
    position: 3,
    icon: "⚠️",
    title: {
      en: "Fear of scams & fake goods",
      vi: "Sợ bị lừa – hàng giả, hàng kém chất lượng",
      zh: "担心诈骗和假货",
    },
    description: {
      en: "Photos show one thing, reality another. Hundreds of dollars lost with no recourse.",
      vi: "Ảnh 1 sao hàng thực tế 0 sao. Hàng trăm đô la bay đi không dấu vết.",
      zh: "照片与实物不符，数百美元损失无处追。",
    },
  },
  {
    position: 4,
    icon: "💸",
    title: {
      en: "Wrong item, no return possible",
      vi: "Hàng sai – không thể hoàn trả",
      zh: "收到错误商品，无法退货",
    },
    description: {
      en: "Wrong or defective goods arrive and returning is impossible due to distance and language barriers.",
      vi: "Hàng sai hoặc lỗi muốn đổi trả không được vì khoảng cách quá xa và bất đồng ngôn ngữ.",
      zh: "收到错误或有缺陷的商品，由于距离和语言障碍无法退货。",
    },
  },
  {
    position: 5,
    icon: "🔄",
    title: {
      en: "Must route through Vietnam first",
      vi: "Phải chuyển vòng qua Việt Nam",
      zh: "必须先经越南中转",
    },
    description: {
      en: "Inspecting in Vietnam before shipping to USA wastes 3–4 extra weeks and $150–300 in unnecessary shipping fees.",
      vi: "Hàng về Việt Nam kiểm tra xong mới dám gửi đi Mỹ – tốn thêm 3–4 tuần và hàng trăm USD phí vô ích.",
      zh: "在越南检查后再寄美国，多浪费3-4周和150-300美元。",
    },
  },
  {
    position: 6,
    icon: "🕰️",
    title: {
      en: "Zero updates, weeks of silence",
      vi: "Chờ đợi mòn mỏi, không ai cập nhật",
      zh: "零更新，数周无音讯",
    },
    description: {
      en: "Order placed, then nothing. No tracking, no communication – weeks of anxious waiting.",
      vi: "Đặt hàng xong rơi vào im lặng. Không biết hàng đang ở đâu – lo lắng suốt cả tháng trời.",
      zh: "下单后杳无音讯。没有跟踪，没有沟通——焦虑等待数周。",
    },
  },
];

// ---- process_step -------------------------------------------------------

const processSteps: BaseBlock[] = [
  {
    position: 1,
    icon: "🔗",
    payload: { num: 1 },
    title: {
      en: "Send product link",
      vi: "Gửi link sản phẩm",
      zh: "发送商品链接",
    },
    description: {
      en: "Copy link from Taobao or 1688, send via Facebook / Messenger",
      vi: "Copy link từ Taobao hoặc 1688 gửi cho THG qua Facebook / Messenger",
      zh: "复制淘宝或1688链接，通过Facebook/Messenger发送",
    },
  },
  {
    position: 2,
    icon: "💬",
    payload: { num: 2 },
    title: {
      en: "Consult & Quote",
      vi: "Tư vấn & Báo giá",
      zh: "咨询报价",
    },
    description: {
      en: "THG verifies supplier, quotes all-in price: goods + shipping + service fee",
      vi: "THG kiểm tra nhà cung cấp, báo giá trọn gói: hàng + ship + phí dịch vụ",
      zh: "THG验证供应商，报全包价：商品+运费+服务费",
    },
  },
  {
    position: 3,
    icon: "🛒",
    payload: { num: 3 },
    title: {
      en: "Order & Payment",
      vi: "Đặt hàng & Thanh toán",
      zh: "下单付款",
    },
    description: {
      en: "You confirm, THG orders in Mandarin – nothing more needed from you",
      vi: "Bạn xác nhận, THG đặt hàng bằng tiếng Trung – không cần bạn làm gì thêm",
      zh: "您确认后，THG用中文下单——无需您做更多",
    },
  },
  {
    position: 4,
    icon: "📹",
    payload: { num: 4 },
    title: {
      en: "Inspect & Video",
      vi: "Kiểm tra & Quay video",
      zh: "检验录像",
    },
    description: {
      en: "Goods arrive at THG warehouse, fully inspected, video sent to you before shipping",
      vi: "Hàng về kho THG, kiểm tra kỹ, quay video gửi bạn xem rồi mới ship",
      zh: "货物到THG仓库，全面检查，发货前发视频给您",
    },
  },
  {
    position: 5,
    icon: "🏠",
    payload: { num: 5 },
    title: {
      en: "Delivered in USA",
      vi: "Giao tận nhà ở Mỹ",
      zh: "送达美国",
    },
    description: {
      en: "Shipped directly to your US address, real-time tracking all the way",
      vi: "Ship thẳng đến địa chỉ tại Hoa Kỳ, tracking real-time liên tục cập nhật",
      zh: "直接发到您的美国地址，全程实时跟踪",
    },
  },
];

// ---- solution -----------------------------------------------------------

const solutions: BaseBlock[] = [
  {
    position: 1,
    icon: "🛡️",
    payload: {
      tag: { en: "Trust & Safety", vi: "Uy tín & An toàn", zh: "信任与安全" },
    },
    title: {
      en: "Real address. Real business. Proven track record.",
      vi: "Đơn vị có địa chỉ thực, hoạt động minh bạch",
      zh: "真实地址，真实企业，过往业绩",
    },
    description: {
      en: "THG Fulfill is a registered business with offices in HCMC, warehouses in Guangdong (China), Milford PA & Winston-Salem NC. Thousands of successful orders.",
      vi: "THG Fulfill có văn phòng tại TP.HCM, kho tại Trung Quốc và Mỹ. Hàng nghìn đơn hàng thành công.",
      zh: "THG Fulfill是注册企业，办公室在胡志明市，仓库在广东（中国）、宾州和北卡。数千成功订单。",
    },
  },
  {
    position: 2,
    icon: "🇨🇳",
    payload: {
      tag: { en: "Mandarin Fluent", vi: "Đàm phán trung gian", zh: "精通中文" },
    },
    title: {
      en: "We negotiate directly with Chinese suppliers for you",
      vi: "Đội ngũ đàm phán trực tiếp với nhà cung cấp China",
      zh: "我们直接用中文与供应商谈判",
    },
    description: {
      en: "Our team handles all communication in Mandarin – price negotiation, quality requests, and dispute resolution. You don't need to know a single Chinese character.",
      vi: "Chúng tôi thương lượng giá, xác minh nhà cung cấp và xử lý toàn bộ bằng tiếng Trung. Bạn không cần biết nửa chữ tiếng Trung.",
      zh: "我们的团队用中文处理所有沟通——议价、质量要求和纠纷解决。您不需要认识任何中文。",
    },
  },
  {
    position: 3,
    icon: "📹",
    payload: {
      tag: { en: "Video Inspection", vi: "Video kiểm hàng thực tế", zh: "视频验货" },
    },
    title: {
      en: "See your goods before they ship – no surprises",
      vi: "Xem video trước khi ship – không bao giờ bị bất ngờ",
      zh: "发货前看到您的商品——没有意外",
    },
    description: {
      en: "100% of orders are inspected and video-recorded before packing. You review the video, approve, then we ship. Fully transparent.",
      vi: "100% đơn hàng được kiểm tra và quay video chi tiết trước khi đóng gói. Bạn xem, xác nhận rồi THG mới gửi đi.",
      zh: "100%订单在包装前进行检查和录像。您审核视频、确认后我们才发货。完全透明。",
    },
  },
  {
    position: 4,
    icon: "↩️",
    payload: {
      tag: { en: "Buyer Protection", vi: "Bảo vệ quyền lợi", zh: "买家保障" },
    },
    title: {
      en: "Defective goods? THG refunds or reships – free",
      vi: "Hàng lỗi – THG hoàn tiền hoặc gửi lại miễn phí",
      zh: "商品有缺陷？THG免费退款或重新发货",
    },
    description: {
      en: "If goods don't match description or are defective, THG takes full responsibility – we work with the Chinese supplier to refund or send new goods at no cost.",
      vi: "Nếu hàng không đúng mô tả hoặc bị lỗi, THG chịu trách nhiệm hoàn toàn – làm việc với nhà cung cấp để hoàn tiền hoặc gửi lại hàng mới.",
      zh: "如果商品与描述不符或有缺陷，THG承担全部责任——与供应商协商退款或免费重发。",
    },
  },
  {
    position: 5,
    icon: "✈️",
    payload: {
      tag: { en: "China → USA Direct", vi: "Ship thẳng China → USA", zh: "中国直邮美国" },
    },
    title: {
      en: "Skip the Vietnam detour. Save 3–4 weeks & $150–300",
      vi: "Không cần vòng qua Việt Nam – tiết kiệm 3–4 tuần",
      zh: "跳过越南中转，节省3-4周和150-300美元",
    },
    description: {
      en: "THG has warehouses in Guangdong (China), Milford PA & Winston-Salem NC. Goods inspected at China warehouse, then shipped directly to your US address.",
      vi: "THG có kho tại Đông Hoản (Trung Quốc), Milford PA & Winston-Salem NC. Hàng kiểm tra tại China rồi ship thẳng đến địa chỉ Mỹ.",
      zh: "THG在广东（中国）、宾州和北卡设有仓库。货物在中国仓库检查后直接发往您的美国地址。",
    },
  },
  {
    position: 6,
    icon: "📡",
    payload: {
      tag: { en: "Real-time Tracking", vi: "Tracking Real-time", zh: "实时追踪" },
    },
    title: {
      en: "Always know where your package is",
      vi: "Biết hàng đang ở đâu – cập nhật chủ động mọi lúc",
      zh: "随时知道包裹在哪里",
    },
    description: {
      en: "Updates via Facebook, Messenger, or email. You don't have to ask – we proactively notify you at every step until your package arrives.",
      vi: "Cập nhật qua Facebook, Messenger hoặc email. Không cần bạn hỏi – THG chủ động thông báo từng bước đến khi hàng gõ cửa nhà bạn.",
      zh: "通过Facebook、Messenger或邮件更新。无需您询问——我们在每个步骤主动通知您。",
    },
  },
];

// ---- shipping_lane ------------------------------------------------------

const shippingLanes: BaseBlock[] = [
  {
    position: 1,
    icon: "✈️",
    payload: {
      tag: { en: "Standard Air", vi: "Hàng không thường", zh: "标准空运" },
      time: { en: "6–12 BSD", vi: "6–12 Ngày LV", zh: "6-12个工作日" },
      features: [
        { en: "Weight: 0.1 kg – 30 kg per package", vi: "Trọng lượng: 0.1kg – 30kg/kiện", zh: "重量：每件0.1-30公斤" },
        { en: "USPS tracking to your door", vi: "Tracking USPS tận nhà", zh: "USPS追踪送货上门" },
        { en: "Tax already included (Yun Express lane)", vi: "Giá đã bao gồm thuế nhập khẩu (line Yun Express)", zh: "已含税（云途渠道）" },
        { en: "Best for: clothes, accessories, small electronics, home goods", vi: "Phù hợp: quần áo, phụ kiện, điện tử nhỏ, đồ gia dụng", zh: "适合：服装、配饰、小电子产品、家居用品" },
        { en: "Price calculated per kg", vi: "Tính giá theo kg", zh: "按公斤计价" },
      ],
      note: { en: "BSD = Business Days (Mon–Fri, excl. holidays)", vi: "BSD = Ngày làm việc (Thứ 2–6, không tính lễ)", zh: "BSD = 工作日（周一至周五，不含节假日）" },
    },
    title: {
      en: "Epacket – Best for small packages",
      vi: "Epacket – Phù hợp gói hàng nhỏ lẻ",
      zh: "Epacket – 最适合小包裹",
    },
    description: { en: "", vi: "", zh: "" },
  },
  {
    position: 2,
    icon: "🚀",
    payload: {
      tag: { en: "Express Air", vi: "Hàng không nhanh", zh: "快速空运" },
      time: { en: "3–5 BSD", vi: "3–5 Ngày LV", zh: "3-5个工作日" },
      features: [
        { en: "Fastest delivery to USA", vi: "Nhanh nhất đến Mỹ", zh: "最快送达美国" },
        { en: "Ideal for urgent orders or high-value goods", vi: "Lý tưởng cho đơn hàng khẩn hoặc hàng giá trị cao", zh: "适合紧急订单或高价值商品" },
        { en: "DHL / FedEx tracking – world-class reliability", vi: "Tracking DHL / FedEx – độ tin cậy cao", zh: "DHL/FedEx追踪——世界级可靠" },
        { en: "Higher cost per kg vs. standard air", vi: "Giá cao hơn line thường", zh: "每公斤成本高于标准空运" },
        { en: "Best for: time-sensitive, lightweight, high-value items", vi: "Phù hợp: hàng khẩn, nhẹ, giá trị cao", zh: "适合：时效性强、轻量、高价值物品" },
      ],
      note: { en: "Contact THG for exact express quote", vi: "Liên hệ THG để được báo giá express chính xác", zh: "联系THG获取准确快递报价" },
    },
    title: {
      en: "DHL / Express – Fastest option",
      vi: "DHL / Express – Nhanh nhất",
      zh: "DHL/快递 – 最快选项",
    },
    description: { en: "", vi: "", zh: "" },
  },
  {
    position: 3,
    icon: "🚢",
    payload: {
      tag: { en: "Sea Freight", vi: "Đường biển", zh: "海运" },
      time: { en: "20–25 BSD", vi: "20–25 Ngày LV", zh: "20-25个工作日" },
      features: [
        { en: "Minimum: 12 kg per package", vi: "Trọng lượng tối thiểu: 12 kg/kiện", zh: "最低：每件12公斤" },
        { en: "Cheapest per-kg cost – ideal for bulk orders", vi: "Giá tốt nhất mỗi kg – lý tưởng cho hàng số lượng lớn", zh: "每公斤最便宜——适合大批量订单" },
        { en: "Price tiers: 12 kg+, 21 kg+, 71 kg+, 100 kg+", vi: "Giảm giá theo khối lượng: 12kg+, 21kg+, 71kg+, 100kg+", zh: "价格阶梯：12kg+、21kg+、71kg+、100kg+" },
        { en: "Best for: furniture, machinery, large household items", vi: "Phù hợp: nội thất, máy móc, hàng gia dụng lớn", zh: "适合：家具、机械、大型家居用品" },
        { en: "Longer transit – plan ahead", vi: "Thời gian dài hơn – cần lên kế hoạch trước", zh: "运输时间较长——需提前计划" },
      ],
      note: { en: "Volume weight: Length × Width × Height ÷ 6000", vi: "Trọng lượng thể tích: Dài × Rộng × Cao ÷ 6000", zh: "体积重量：长×宽×高÷6000" },
    },
    title: {
      en: "Bulk Sea – Best price for heavy cargo",
      vi: "Hàng Lô Biển – Giá tốt nhất cho hàng nặng",
      zh: "散货海运 – 重货最优价",
    },
    description: { en: "", vi: "", zh: "" },
  },
];

// ---- policy -------------------------------------------------------------

const policies: BaseBlock[] = [
  {
    position: 1,
    icon: "💰",
    payload: {
      tag: { en: "Compensation Policy", vi: "Chính sách đền bù", zh: "赔偿政策" },
      items: [
        { en: "✅ Delayed 20+ BSD due to THG error → 100% shipping refund", vi: "✅ Chậm hơn 20 ngày làm việc do lỗi THG → Hoàn 100% phí vận chuyển", zh: "✅ 因THG失误延迟20+工作日 → 100%退运费" },
        { en: "✅ Lost / damaged small package → Up to $20–$50/order compensation", vi: "✅ Hàng lẻ thất lạc, hư hỏng → Đền bù tối đa $20–$50/đơn", zh: "✅ 小包丢失/损坏 → 最高$20-$50/单赔偿" },
        { en: "✅ Bulk goods lost in transit → $5/kg compensation", vi: "✅ Hàng lô mất trong vận chuyển → Bồi thường $5/kg", zh: "✅ 散货运输中丢失 → $5/kg赔偿" },
        { en: "✅ Refund to account within 15 business days", vi: "✅ Hoàn tiền về tài khoản trong vòng 15 ngày làm việc", zh: "✅ 15个工作日内退款到账" },
      ],
    },
    title: {
      en: "THG compensates if things go wrong",
      vi: "THG cam kết bồi thường nếu có sự cố",
      zh: "THG出问题时赔偿",
    },
    description: { en: "", vi: "", zh: "" },
  },
  {
    position: 2,
    icon: "🚫",
    payload: {
      tag: { en: "Prohibited Goods", vi: "Hàng cấm vận chuyển", zh: "禁运物品" },
      items: [
        { en: "⛔ Explosives, weapons, radioactive materials", vi: "⛔ Chất nổ, vũ khí, vật liệu phóng xạ", zh: "⛔ 爆炸物、武器、放射性物质" },
        { en: "⛔ Flammable materials, gas lighters", vi: "⛔ Chất dễ cháy, bật lửa có gas/xăng", zh: "⛔ 易燃物、气体打火机" },
        { en: "⛔ Narcotics, controlled substances", vi: "⛔ Chất gây nghiện, kích thích", zh: "⛔ 毒品、管制物质" },
        { en: "⛔ Pharmaceuticals, liquids, powders (some lanes)", vi: "⛔ Dược phẩm, chất lỏng, bột (một số line)", zh: "⛔ 药品、液体、粉末（部分渠道）" },
        { en: "⛔ Currency, financial documents", vi: "⛔ Tiền tệ, tài liệu tài chính", zh: "⛔ 货币、金融文件" },
        { en: "⛔ Animal products, natural wood", vi: "⛔ Sản phẩm từ động vật, gỗ tự nhiên", zh: "⛔ 动物制品、天然木材" },
      ],
    },
    title: {
      en: "Items we cannot ship",
      vi: "Danh mục hàng cấm – vui lòng kiểm tra trước",
      zh: "我们无法运输的物品",
    },
    description: { en: "", vi: "", zh: "" },
  },
  {
    position: 3,
    icon: "📋",
    payload: {
      tag: { en: "Key Terms", vi: "Điều khoản quan trọng", zh: "重要条款" },
      items: [
        { en: "📌 Delivery times are estimates – excludes weekends, holidays & force majeure", vi: "📌 Thời gian giao hàng là ước tính – không tính cuối tuần, lễ, bất khả kháng", zh: "📌 交货时间为估计值——不含周末、节假日和不可抗力" },
        { en: "📌 Customer is responsible for accurate goods declaration", vi: "📌 Khách hàng chịu trách nhiệm khai báo đúng thông tin hàng hóa", zh: "📌 客户负责准确申报货物信息" },
        { en: "📌 Tracking inactive 21+ days → investigated as lost", vi: "📌 Tracking quá 21 ngày không hoạt động → xem xét thất lạc", zh: "📌 追踪21+天无更新 → 视为丢失调查" },
        { en: "📌 THG does not offer return-to-Vietnam / China service", vi: "📌 THG không cung cấp dịch vụ trả hàng về Việt Nam / Trung Quốc", zh: "📌 THG不提供退回越南/中国服务" },
        { en: "📌 Fragile goods: customer must ensure adequate protective packaging", vi: "📌 Hàng dễ vỡ: khách hàng tự đảm bảo đóng gói chống sốc", zh: "📌 易碎品：客户须确保充分防护包装" },
      ],
    },
    title: {
      en: "Important things to know before ordering",
      vi: "Một số điểm bạn cần lưu ý",
      zh: "下单前需要了解的重要事项",
    },
    description: { en: "", vi: "", zh: "" },
  },
  {
    position: 4,
    icon: "📣",
    payload: {
      tag: { en: "Claims Process", vi: "Khiếu nại & Giải quyết", zh: "索赔流程" },
      items: [
        { en: "⏱️ Lost goods: claim within 2 months of ship date", vi: "⏱️ Mất hàng: Khiếu nại trong vòng 2 tháng kể từ ngày ship", zh: "⏱️ 丢失货物：发货日起2个月内索赔" },
        { en: "⏱️ Damaged / price disputes: claim within 3 days of delivery", vi: "⏱️ Hư hỏng / giá cước: Trong vòng 3 ngày nhận hàng", zh: "⏱️ 损坏/价格争议：收货3天内索赔" },
        { en: "⚡ THG resolves claims within 7–20 business days", vi: "⚡ THG xử lý khiếu nại trong vòng 7–20 ngày làm việc", zh: "⚡ THG在7-20个工作日内解决索赔" },
        { en: "💬 Contact directly via Facebook or Hotline for fastest support", vi: "💬 Liên hệ trực tiếp qua Facebook hoặc Hotline để được hỗ trợ nhanh nhất", zh: "💬 通过Facebook或热线直接联系获取最快支持" },
      ],
    },
    title: {
      en: "Fast, transparent claims resolution",
      vi: "Quy trình khiếu nại nhanh chóng",
      zh: "快速透明的索赔处理",
    },
    description: { en: "", vi: "", zh: "" },
  },
];

const BUNDLES: KindBundle[] = [
  { kind: "pain_point", blocks: painPoints },
  { kind: "process_step", blocks: processSteps },
  { kind: "solution", blocks: solutions },
  { kind: "shipping_lane", blocks: shippingLanes },
  { kind: "policy", blocks: policies },
];

const LOCALES = ["en", "vi", "zh"] as const;
type Locale = (typeof LOCALES)[number];

function isTrio(v: unknown): v is Trio {
  return !!v && typeof v === "object" && "en" in v && "vi" in v && "zh" in v;
}

/** Localise any value inside a payload entry: Trio → string; arrays of Trio →
 *  arrays of string; primitives pass through. */
function localiseValue(v: unknown, locale: Locale): unknown {
  if (isTrio(v)) return v[locale];
  if (Array.isArray(v)) return v.map((x) => localiseValue(x, locale));
  return v;
}

function buildPayload(payload: BaseBlock["payload"], locale: Locale): Record<string, unknown> {
  if (!payload) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    out[k] = localiseValue(v, locale);
  }
  return out;
}

/** SQLite single-quoted literal with CHAR(10) joins to keep newlines portable. */
function sqlLiteral(s: string): string {
  const escaped = s.replace(/'/g, "''");
  const parts = escaped.split("\n");
  if (parts.length === 1) return `'${parts[0]}'`;
  return parts.map((p) => `'${p}'`).join(" || CHAR(10) || ");
}

const lines: string[] = [];
lines.push("-- Seed generic service_blocks for /thg-order. Generated by db/seeds/order-service-blocks.ts.");
lines.push("-- Re-runnable: replaces existing page_slug='thg-order' rows.");
lines.push("");
lines.push("DELETE FROM service_blocks WHERE page_slug = 'thg-order';");
lines.push("");

for (const bundle of BUNDLES) {
  lines.push(`-- kind: ${bundle.kind}`);
  for (const block of bundle.blocks) {
    for (const locale of LOCALES) {
      const payloadJson = JSON.stringify(buildPayload(block.payload, locale));
      lines.push(
        `INSERT INTO service_blocks (page_slug, kind, position, locale, icon, title, description, payload_json) VALUES (` +
          `'thg-order', '${bundle.kind}', ${block.position}, '${locale}', ` +
          `${block.icon === null ? "NULL" : sqlLiteral(block.icon)}, ` +
          `${sqlLiteral(block.title[locale])}, ` +
          `${sqlLiteral(block.description[locale])}, ` +
          `${sqlLiteral(payloadJson)});`,
      );
    }
    lines.push("");
  }
}

process.stdout.write(lines.join("\n") + "\n");
