// Mock data cho THG Content OS (CMS prototype) — bám theo thgfulfill.com

export const CURRENT_USER = {
  name: "Minh Nguyễn",
  email: "minh@thgfulfill.com",
  role: "Super Admin",
  initial: "M",
};

export const STATS = [
  { label: "Bản nháp đang chờ duyệt", value: "12", delta: "+3", trend: "up", hint: "so với tuần trước" },
  { label: "Bài đã xuất bản (30 ngày)", value: "47", delta: "+18%", trend: "up", hint: "tốc độ ổn định" },
  { label: "Yêu cầu thay đổi mở", value: "5", delta: "-2", trend: "down", hint: "đã xử lý 2 hôm nay" },
  { label: "Agent jobs đang chạy", value: "3", delta: "Live", trend: "live", hint: "2 sắp hoàn tất" },
];

export const ACTIVITY_FEED = [
  { id: 1, who: "Linh Trần", action: "đã duyệt", target: "Hero homepage v3.2", time: "2 phút trước", type: "approve" },
  { id: 2, who: "AI Agent", action: "tạo bản nháp", target: "Blog: TikTok Shop 2025", time: "12 phút trước", type: "ai" },
  { id: 3, who: "Khôi Vũ", action: "yêu cầu cập nhật giá", target: "Express VN→US", time: "34 phút trước", type: "change" },
  { id: 4, who: "Hoa Lê", action: "publish", target: "Pricing — March 2025", time: "1 giờ trước", type: "publish" },
  { id: 5, who: "AI Agent", action: "fail job", target: "Summarize policy", time: "2 giờ trước", type: "error" },
  { id: 6, who: "An Phạm", action: "thêm FAQ mới", target: "TikTok Shop yêu cầu giấy tờ", time: "3 giờ trước", type: "create" },
];

export const PENDING_REVIEWS = [
  { id: "rv1", title: "Viết lại hero homepage cho POD sellers", type: "Homepage", risk: "critical", by: "AI Agent", ai: true, time: "2 giờ trước" },
  { id: "rv2", title: "Cập nhật giá Epacket — tháng 3/2025", type: "Pricing", risk: "high", by: "Khôi Vũ", ai: false, time: "4 giờ trước" },
  { id: "rv3", title: "Bài blog: Cách POD seller giảm delay ship", type: "Blog", risk: "low", by: "AI Agent", ai: true, time: "1 ngày trước" },
  { id: "rv4", title: "Refund policy v2.3", type: "Policy", risk: "critical", by: "Linh Trần", ai: false, time: "1 ngày trước" },
  { id: "rv5", title: "Service: Thêm Amazon FBA Prep", type: "Service", risk: "medium", by: "AI Agent", ai: true, time: "2 ngày trước" },
];

export const BLOGS = [
  { id: "b1", title: "Hướng dẫn bán hàng TikTok Shop US 2025", status: "published", author: "AI Agent", ai: true, category: "TikTok Shop", seo: 92, updated: "2 ngày" },
  { id: "b2", title: "So sánh tuyến vận chuyển VN → US", status: "published", author: "Linh Trần", ai: false, category: "Vận chuyển", seo: 88, updated: "1 tuần" },
  { id: "b3", title: "Chiến lược fulfillment cho seller mới", status: "review", author: "AI Agent", ai: true, category: "Fulfillment", seo: 76, updated: "3 giờ" },
  { id: "b4", title: "Tối ưu chi phí kho lưu trữ tại VN", status: "draft", author: "An Phạm", ai: false, category: "Warehouse", seo: 45, updated: "5 giờ" },
  { id: "b5", title: "Amazon FBA vs Self-fulfillment 2025", status: "draft", author: "AI Agent", ai: true, category: "Ecommerce", seo: 81, updated: "1 ngày" },
  { id: "b6", title: "10 lỗi POD seller mới hay mắc", status: "review", author: "AI Agent", ai: true, category: "TikTok Shop", seo: 84, updated: "2 ngày" },
  { id: "b7", title: "Cẩm nang HS code cho hàng POD", status: "published", author: "Khôi Vũ", ai: false, category: "Hải quan", seo: 90, updated: "3 tuần" },
];

export const SERVICES = [
  { id: "thg-fulfill", name: "THG Fulfill", icon: "📦", tagline: "Ecosystem A-Z, POD printing VN/CN/US", priceFrom: "$2.50", routes: 12, status: "active" },
  { id: "thg-express", name: "THG Express", icon: "✈️", tagline: "Air freight VN/CN → US/UK 5–8 ngày", priceFrom: "$4.20/kg", routes: 8, status: "active" },
  { id: "thg-warehouse", name: "THG Warehouse", icon: "🏭", tagline: "US domestic fulfill từ $1.2", priceFrom: "$1.20", routes: 4, status: "active" },
];

// Service detail pages
export const SERVICE_PAGES: Record<string, {
  hero: { eyebrow: string; title: string; sub: string; ctaText: string; ctaUrl: string };
  bullets: string[];
  faqs: { q: string; a: string }[];
}> = {
  "thg-fulfill": {
    hero: {
      eyebrow: "Fulfill Ecosystem A-Z",
      title: "THG Fulfill — POD printing VN, CN & USA",
      sub: "POD printing tại Vietnam, China, USA với base price cạnh tranh. Hỗ trợ dropship trending products.",
      ctaText: "Tìm hiểu thêm",
      ctaUrl: "/thg-fulfill",
    },
    bullets: [
      "Trending product dropship support",
      "Dropship trending products from China",
      "Competitive base pricing",
      "Print quality 300 DPI guaranteed",
    ],
    faqs: [
      { q: "POD print loại sản phẩm nào?", a: "T-shirt, hoodie, mug, poster, phone case, all-over print." },
      { q: "Min order quantity?", a: "Không có MOQ — print từ 1 sản phẩm." },
    ],
  },
  "thg-express": {
    hero: {
      eyebrow: "International Shipping",
      title: "THG Express — Air freight chuyên tuyến",
      sub: "Tuyến chuyên dụng VN/CN → US/UK. Pricing minh bạch, real-time order tracking.",
      ctaText: "Xem bảng giá",
      ctaUrl: "/thg-express",
    },
    bullets: [
      "Dedicated routes VN/CN → US/UK",
      "Real-time order tracking",
      "Delivery in 5-8 days",
      "Cargo insurance included",
    ],
    faqs: [
      { q: "Có ship hàng pin lithium không?", a: "Có, theo quy định IATA, cần khai báo trước." },
      { q: "Tracking realtime ở đâu?", a: "Dashboard THG OMS hoặc qua API webhook." },
    ],
  },
  "thg-warehouse": {
    hero: {
      eyebrow: "US Warehousing",
      title: "THG Warehouse — Fulfill từ Mỹ chỉ $1.2",
      sub: "US domestic fulfillment từ kho PA & NC. Free inbound, 90-day storage. OMS/WMS integrated.",
      ctaText: "Đăng ký kho",
      ctaUrl: "/thg-warehouse",
    },
    bullets: [
      "Fulfill từ $1.2/order",
      "Free 90-day storage",
      "US domestic delivery 2–5 days",
      "Tích hợp OMS/WMS thời gian thực",
    ],
    faqs: [
      { q: "Phí lưu kho sau 90 ngày?", a: "$0.50/m³/tháng cho hàng tồn." },
      { q: "Có hỗ trợ FBA prep?", a: "Có — pick, pack, label theo chuẩn Amazon." },
    ],
  },
};

// Landing page sections (homepage thgfulfill.com)
export const LANDING_SECTIONS = [
  { id: "hero", title: "Hero Section", desc: "Tiêu đề chính, sub-headline, CTA, ảnh nền 3D globe", fields: 6, lastEdit: "2 giờ trước", status: "review" },
  { id: "trust", title: "Trust Bar", desc: "5-8 days delivery, 4 warehouses in 3 countries, US fulfill từ $1.2", fields: 8, lastEdit: "1 tuần trước", status: "live" },
  { id: "services", title: "Services Grid (A-Z)", desc: "3 service cards: THG Fulfill, THG Express, THG Warehouse", fields: 12, lastEdit: "3 ngày trước", status: "live" },
  { id: "about", title: "About + YouTube", desc: "Embed video, end-to-end fulfillment ASEAN → US", fields: 5, lastEdit: "2 tuần trước", status: "live" },
  { id: "glance", title: "Services at a Glance", desc: "4 mini cards: Sourcing, POD, Warehouse, Express", fields: 8, lastEdit: "5 ngày trước", status: "live" },
  { id: "personas", title: "Who We Serve", desc: "New / Scaling / Team / Brand & DTC sellers", fields: 8, lastEdit: "2 tuần trước", status: "live" },
  { id: "process", title: "How It Works (4 steps)", desc: "Register → Ship to warehouse → Process → Deliver", fields: 16, lastEdit: "2 tuần trước", status: "live" },
  { id: "advantages", title: "Why THG (6 advantages)", desc: "Cost, Fast delivery, Coverage, Reliability, Tech, Support", fields: 18, lastEdit: "1 tháng trước", status: "live" },
  { id: "marketplaces", title: "Marketplaces Sync", desc: "Etsy, Amazon, TikTok Shop, eBay, Shopify, Woo", fields: 12, lastEdit: "1 tháng trước", status: "live" },
  { id: "testimonials", title: "Customer Reviews", desc: "4 reviews từ POD/Dropship/Brand sellers", fields: 16, lastEdit: "3 tuần trước", status: "live" },
  { id: "faq", title: "FAQ Preview", desc: "5 câu Q&A xuất hiện trên homepage", fields: 10, lastEdit: "2 tuần trước", status: "live" },
  { id: "gallery", title: "Warehouse Gallery", desc: "9 ảnh kho thật tại PA & NC", fields: 9, lastEdit: "1 tháng trước", status: "live" },
  { id: "cta", title: "Final CTA", desc: "15% OFF for first 50 orders, submit inquiry", fields: 4, lastEdit: "2 tháng trước", status: "live" },
];

// Default content for hero (for live preview demo)
export const HERO_DEFAULT = {
  promo: "15% OFF for first 50 orders",
  eyebrow: "Catalog site",
  title: "Your Global Fulfillment Partner for eCommerce Sellers",
  sub: "A comprehensive fulfillment ecosystem, seamlessly connecting from Vietnam – China – to warehouses in the US.",
  bullets: ["Product sourcing", "POD products", "Warehouse management", "International shipping US, UK, EU"],
  ctaPrimary: "Catalog site",
  ctaSecondary: "Learn More",
};

// Pricing — international air freight (THG Express)
export const PRICING_INTL = [
  { id: "i1", route: "VN → US (East Coast)", carrier: "THG Express Air", from: "$4.20/kg", eta: "5–8 ngày", min: "100g", max: "30kg", status: "live" },
  { id: "i2", route: "VN → US (West Coast)", carrier: "THG Express Air", from: "$3.80/kg", eta: "4–7 ngày", min: "100g", max: "30kg", status: "live" },
  { id: "i3", route: "CN → US (East Coast)", carrier: "THG Express Air", from: "$4.50/kg", eta: "5–8 ngày", min: "100g", max: "50kg", status: "live" },
  { id: "i4", route: "CN → US (West Coast)", carrier: "THG Express Air", from: "$4.10/kg", eta: "4–6 ngày", min: "100g", max: "50kg", status: "live" },
  { id: "i5", route: "VN → UK", carrier: "THG Express Air", from: "$5.20/kg", eta: "6–9 ngày", min: "100g", max: "20kg", status: "live" },
  { id: "i6", route: "VN → EU (DE/FR/NL)", carrier: "THG Express Air", from: "$5.80/kg", eta: "5–8 ngày", min: "100g", max: "20kg", status: "review" },
  { id: "i7", route: "Epacket VN → US", carrier: "Epacket", from: "$8.50/kg", eta: "10–15 ngày", min: "50g", max: "2kg", status: "live" },
  { id: "i8", route: "DHL Express US", carrier: "DHL", from: "$22.00/kg", eta: "3–5 ngày", min: "100g", max: "30kg", status: "live" },
];

// Pricing — US domestic (THG Warehouse)
export const PRICING_US = [
  { id: "u1", service: "Pick & Pack — 1 SKU", warehouse: "PA & NC", from: "$1.20/order", note: "Bao gồm label, túi shipping", status: "live" },
  { id: "u2", service: "Pick & Pack — 2-5 SKUs", warehouse: "PA & NC", from: "$1.80/order", note: "+ $0.30/SKU thêm", status: "live" },
  { id: "u3", service: "Storage 0-90 ngày", warehouse: "PA & NC", from: "Miễn phí", note: "Free 90-day storage cho seller mới", status: "live" },
  { id: "u4", service: "Storage > 90 ngày", warehouse: "PA & NC", from: "$0.50/m³/tháng", note: "Tính theo dung tích thực", status: "live" },
  { id: "u5", service: "Inbound receiving", warehouse: "PA & NC", from: "Miễn phí", note: "Tới 50 thùng/lô", status: "live" },
  { id: "u6", service: "FBA Prep & Label", warehouse: "PA & NC", from: "$1.50/unit", note: "Theo chuẩn Amazon", status: "review" },
  { id: "u7", service: "Return processing", warehouse: "PA", from: "$2.00/return", note: "Inspect + restock", status: "live" },
];

// Careers (Tuyển dụng)
export const CAREERS_JOBS = [
  { id: "j1", title: "Senior Fulfillment Operations Manager", location: "TP.HCM", type: "Full-time", dept: "Operations", status: "open", applicants: 12, posted: "3 ngày" },
  { id: "j2", title: "US Warehouse Lead", location: "Milford, PA", type: "Full-time", dept: "Operations", status: "open", applicants: 8, posted: "1 tuần" },
  { id: "j3", title: "Customer Success (English fluent)", location: "TP.HCM / Remote", type: "Full-time", dept: "CS", status: "open", applicants: 24, posted: "2 tuần" },
  { id: "j4", title: "Marketing Content Writer", location: "TP.HCM", type: "Part-time", dept: "Marketing", status: "open", applicants: 18, posted: "5 ngày" },
  { id: "j5", title: "Logistics Intern", location: "TP.HCM", type: "Intern", dept: "Operations", status: "open", applicants: 31, posted: "1 tuần" },
  { id: "j6", title: "Frontend Developer (React)", location: "TP.HCM / Hybrid", type: "Full-time", dept: "Engineering", status: "closed", applicants: 42, posted: "1 tháng" },
];

export const JOB_DETAIL: Record<string, {
  description: string;
  requirements: string[];
  benefits: string[];
  deadline: string;
  applyUrl: string;
}> = {
  j1: {
    description: "Quản lý vận hành đầu Việt Nam cho team fulfillment 30+ người. Tối ưu quy trình pick-pack-ship, làm việc trực tiếp với 3 kho US/CN.",
    requirements: ["3+ năm kinh nghiệm vận hành kho/fulfillment", "Tiếng Anh giao tiếp tốt", "Quen tool WMS/OMS", "Tư duy hệ thống, data-driven"],
    benefits: ["Lương net 35-50tr + thưởng KPI quý", "Bảo hiểm sức khỏe cho cả gia đình", "Laptop + thiết bị làm việc", "13 tháng lương + Tết"],
    deadline: "30/04/2026",
    applyUrl: "https://thgfulfill.com/careers/j1/apply",
  },
};

export const APPLICANTS = [
  { id: "a1", name: "Trần Văn Hòa", job: "Senior Fulfillment Ops Manager", jobId: "j1", email: "hoa.tv@email.com", phone: "0901***234", status: "interview", applied: "2 ngày" },
  { id: "a2", name: "Nguyễn Thị Hương", job: "Customer Success", jobId: "j3", email: "huong.nt@email.com", phone: "0912***567", status: "new", applied: "5 giờ" },
  { id: "a3", name: "Lê Minh Tú", job: "Marketing Content Writer", jobId: "j4", email: "tu.lm@email.com", phone: "0987***123", status: "new", applied: "1 ngày" },
  { id: "a4", name: "Phạm Quốc Anh", job: "US Warehouse Lead", jobId: "j2", email: "anh.pq@email.com", phone: "+1 570 ***", status: "offer", applied: "5 ngày" },
  { id: "a5", name: "Vũ Thanh Hà", job: "Logistics Intern", jobId: "j5", email: "ha.vt@email.com", phone: "0334***890", status: "interview", applied: "3 ngày" },
  { id: "a6", name: "Hoàng Đức Thành", job: "Customer Success", jobId: "j3", email: "thanh.hd@email.com", phone: "0978***456", status: "rejected", applied: "1 tuần" },
  { id: "a7", name: "Đinh Mai Linh", job: "Marketing Content Writer", jobId: "j4", email: "linh.dm@email.com", phone: "0865***321", status: "new", applied: "12 giờ" },
];

// Testimonials
export const TESTIMONIALS = [
  { id: "t1", name: "Nguyen Minh Tuan", role: "POD Seller • Etsy & TikTok", flag: "🇻🇳", quote: "THG Fulfill helped me grow from 50 to 500+ orders/month. Their base cost is unbeatable and support is always responsive.", rating: 5, featured: true },
  { id: "t2", name: "David Chen", role: "Dropship Seller • Amazon", flag: "🇺🇸", quote: "US domestic fulfillment from $1.2/order is a real game-changer. My customers receive orders in 2–5 days instead of 2–3 weeks.", rating: 5, featured: true },
  { id: "t3", name: "Tran Thi Mai", role: "Brand Owner • Shopify", flag: "🇻🇳", quote: "Transparent pricing, no hidden fees. The packing video feature gives me peace of mind for every order shipped.", rating: 5, featured: true },
  { id: "t4", name: "Kevin Nguyen", role: "eCommerce Team Lead", flag: "🇺🇸", quote: "We used 3 different fulfillment partners before switching to THG. One single ecosystem handling everything from POD to US warehouse. Amazing.", rating: 5, featured: true },
  { id: "t5", name: "Sophia Park", role: "Brand Director • Etsy", flag: "🇰🇷", quote: "Print quality is consistently excellent. We've shipped 20k+ POD shirts via THG with under 0.5% defect rate.", rating: 4, featured: false },
  { id: "t6", name: "Le Hoang Phuc", role: "TikTok Shop seller", flag: "🇻🇳", quote: "Tracking realtime + Vietnamese support 24/7 = không cần stress mỗi mùa peak.", rating: 5, featured: false },
];

// Marketplace integrations
export const MARKETPLACES = [
  { id: "etsy", name: "Etsy", emoji: "🛍️", status: "ready", docs: "https://docs.thgfulfill.com/etsy", featured: true },
  { id: "amazon", name: "Amazon", emoji: "📦", status: "ready", docs: "https://docs.thgfulfill.com/amazon", featured: true },
  { id: "tiktok", name: "TikTok Shop", emoji: "🎵", status: "ready", docs: "https://docs.thgfulfill.com/tiktok", featured: true },
  { id: "ebay", name: "eBay", emoji: "🏷️", status: "ready", docs: "https://docs.thgfulfill.com/ebay", featured: true },
  { id: "shopify", name: "Shopify", emoji: "🛒", status: "ready", docs: "https://docs.thgfulfill.com/shopify", featured: true },
  { id: "woo", name: "WooCommerce", emoji: "🔌", status: "ready", docs: "https://docs.thgfulfill.com/woo", featured: true },
  { id: "temu", name: "Temu", emoji: "🟠", status: "soon", docs: "", featured: false },
  { id: "walmart", name: "Walmart", emoji: "🏬", status: "soon", docs: "", featured: false },
];

// Gallery (warehouse photos thật từ thgfulfill.com)
export const GALLERY = [
  { id: "g1", url: "https://w.ladicdn.com/s1500x1100/67e69e24e8a7ba001127c80a/kho-my-10-1-20250729095528-mkcfd.jpg", alt: "Kho US Pennsylvania — packing area", featured: true },
  { id: "g2", url: "https://w.ladicdn.com/s1500x1100/67e69e24e8a7ba001127c80a/kho-my-11-1-20250729095528-nzruq.jpg", alt: "Inbound receiving zone", featured: true },
  { id: "g3", url: "https://w.ladicdn.com/s1500x1100/67e69e24e8a7ba001127c80a/kho-my-14-1-20250729095528-dcsxm.jpg", alt: "Shelf storage area", featured: true },
  { id: "g4", url: "https://w.ladicdn.com/s1500x1100/67e69e24e8a7ba001127c80a/1-20250724024641-4oczs.png", alt: "Order processing line", featured: true },
  { id: "g5", url: "https://w.ladicdn.com/s1500x1100/67e69e24e8a7ba001127c80a/kho-my-13-20250724024632-bt6u-.jpg", alt: "Outbound staging", featured: true },
  { id: "g6", url: "https://w.ladicdn.com/s1500x1100/67e69e24e8a7ba001127c80a/img_9873-20250801074610-q-tfu.jpg", alt: "POD printing station", featured: true },
  { id: "g7", url: "https://w.ladicdn.com/s1500x1100/67e69e24e8a7ba001127c80a/img_9988-20250801074609-jjvij.jpg", alt: "T-shirt quality check", featured: true },
  { id: "g8", url: "https://w.ladicdn.com/s1500x1100/67e69e24e8a7ba001127c80a/retouch_2025072518361201-20250801074608-tsi9a.jpg", alt: "Print press operation", featured: true },
  { id: "g9", url: "https://w.ladicdn.com/s1500x1100/67e69e24e8a7ba001127c80a/img_7181-20250801190217-bvrod.jpg", alt: "Final packaging", featured: true },
];

// Offices & Contact
export const OFFICES = [
  { id: "o1", name: "Vietnam Office", country: "🇻🇳", address: "121/5 Đ. Kênh 19/5, Sơn Kỳ, Tân Phú, TP.HCM", phone: "0335.124.089", email: "info@thgfulfill.com", primary: true },
  { id: "o2", name: "US Warehouse — Pennsylvania", country: "🇺🇸", address: "108 Almond CT, Milford, PA 18337", phone: "+1 (570) 618-1169", email: "us@thgfulfill.com", primary: false },
  { id: "o3", name: "US Warehouse — North Carolina", country: "🇺🇸", address: "4136 Sunflower Circle, Winston-Salem, NC 27105", phone: "+1 (570) 618-1169", email: "us@thgfulfill.com", primary: false },
  { id: "o4", name: "China Warehouse", country: "🇨🇳", address: "广东省东莞市常平镇霞坑新宅二区三街101", phone: "—", email: "cn@thgfulfill.com", primary: false },
];

export const FAQS = [
  { id: "f1", q: "Tôi cần giấy tờ gì để bán trên TikTok Shop US?", category: "TikTok Shop", views: 1240, updated: "2 ngày" },
  { id: "f2", q: "Thời gian ship trung bình từ VN đến US?", category: "Vận chuyển", views: 980, updated: "1 tuần" },
  { id: "f3", q: "Có hỗ trợ COD không?", category: "Thanh toán", views: 760, updated: "2 tuần" },
  { id: "f4", q: "Phí lưu kho tính như thế nào?", category: "Warehouse", views: 540, updated: "1 tháng" },
  { id: "f5", q: "Có ship hàng pin lithium không?", category: "Hải quan", views: 420, updated: "2 tháng" },
  { id: "f6", q: "Min order quantity cho POD là bao nhiêu?", category: "POD", views: 380, updated: "3 tuần" },
  { id: "f7", q: "Tôi có thể tích hợp với Shopify không?", category: "Integration", views: 620, updated: "1 tuần" },
];

export const POLICIES = [
  { id: "po1", name: "Refund Policy", version: "v2.3", status: "review", updated: "1 ngày" },
  { id: "po2", name: "Privacy Policy", version: "v1.8", status: "live", updated: "2 tháng" },
  { id: "po3", name: "Terms of Service", version: "v3.1", status: "live", updated: "1 tháng" },
  { id: "po4", name: "Shipping Policy", version: "v2.0", status: "live", updated: "3 tuần" },
];

export const AGENT_JOBS = [
  { id: "aj1", task: "Research blog: Fulfillment trends 2025", source: "CMS", by: "Linh Trần", status: "running", progress: 65, started: "12 phút trước", target: "Blog" },
  { id: "aj2", task: "Viết lại hero homepage cho POD focus", source: "Telegram", by: "Minh Nguyễn", status: "review", progress: 100, started: "2 giờ trước", target: "Homepage" },
  { id: "aj3", task: "Tạo FAQ từ log support khách hàng", source: "Schedule", by: "System", status: "running", progress: 30, started: "5 phút trước", target: "FAQ" },
  { id: "aj4", task: "Dịch 3 blog post sang tiếng Việt", source: "CMS", by: "An Phạm", status: "done", progress: 100, started: "1 ngày trước", target: "Blog" },
  { id: "aj5", task: "Tóm tắt update policy TikTok Shop", source: "Telegram", by: "Khôi Vũ", status: "failed", progress: 45, started: "3 giờ trước", target: "Policy" },
];

export const CHANGE_REQUESTS = [
  { id: "cr1", title: "Đổi giá Express VN→US theo tháng 3", target: "Pricing", by: "Khôi Vũ", status: "open", priority: "high", time: "2 giờ" },
  { id: "cr2", title: "Cập nhật ảnh hero homepage", target: "Landing", by: "Linh Trần", status: "open", priority: "medium", time: "5 giờ" },
  { id: "cr3", title: "Thêm tuyến VN→AU vào pricing", target: "Pricing Quốc tế", by: "Hoa Lê", status: "in_review", priority: "medium", time: "1 ngày" },
  { id: "cr4", title: "Sửa typo trong Refund Policy", target: "Policy", by: "An Phạm", status: "open", priority: "low", time: "1 ngày" },
  { id: "cr5", title: "Refresh toàn bộ FAQ TikTok Shop", target: "FAQ", by: "AI Agent", status: "in_review", priority: "high", time: "2 ngày" },
];

export const USERS = [
  { id: "u1", name: "Minh Nguyễn", email: "minh@thgfulfill.com", role: "Super Admin", color: "from-violet-500 to-indigo-500", active: "Vừa xong" },
  { id: "u2", name: "Linh Trần", email: "linh@thgfulfill.com", role: "Content Manager", color: "from-pink-500 to-rose-500", active: "12 phút trước" },
  { id: "u3", name: "An Phạm", email: "an@thgfulfill.com", role: "Writer", color: "from-emerald-500 to-teal-500", active: "1 giờ trước" },
  { id: "u4", name: "Hoa Lê", email: "hoa@thgfulfill.com", role: "Finance", color: "from-amber-500 to-orange-500", active: "3 giờ trước" },
  { id: "u5", name: "Khôi Vũ", email: "khoi@thgfulfill.com", role: "Sales / Ops", color: "from-cyan-500 to-blue-500", active: "Hôm qua" },
];

export const AUDIT = [
  { id: "a1", actor: "Linh Trần", action: "PUBLISH", target: "Pricing — March 2025", ip: "14.224.x.x", time: "10:32 hôm nay", risk: "high" },
  { id: "a2", actor: "AI Agent", action: "CREATE_DRAFT", target: "Blog: TikTok Shop 2025", ip: "system", time: "10:18 hôm nay", risk: "low" },
  { id: "a3", actor: "Minh Nguyễn", action: "ROLE_CHANGE", target: "u3 → Writer", ip: "118.69.x.x", time: "09:45 hôm nay", risk: "high" },
  { id: "a4", actor: "Hoa Lê", action: "APPROVE", target: "Refund Policy v2.3", ip: "14.224.x.x", time: "08:12 hôm nay", risk: "medium" },
  { id: "a5", actor: "Khôi Vũ", action: "EDIT", target: "Service: TikTok Logistics", ip: "171.255.x.x", time: "Hôm qua 17:30", risk: "low" },
];

export const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  published: { label: "Đã xuất bản", className: "bg-success/10 text-success border-success/20" },
  live: { label: "Đang chạy", className: "bg-success/10 text-success border-success/20" },
  active: { label: "Hoạt động", className: "bg-success/10 text-success border-success/20" },
  ready: { label: "Sync Ready", className: "bg-success/10 text-success border-success/20" },
  soon: { label: "Sắp ra mắt", className: "bg-info/10 text-info border-info/20" },
  open: { label: "Đang tuyển", className: "bg-success/10 text-success border-success/20" },
  closed: { label: "Đã đóng", className: "bg-muted text-muted-foreground border-border" },
  review: { label: "Chờ duyệt", className: "bg-warning/10 text-warning-foreground border-warning/30" },
  in_review: { label: "Đang duyệt", className: "bg-warning/10 text-warning-foreground border-warning/30" },
  draft: { label: "Bản nháp", className: "bg-muted text-muted-foreground border-border" },
  done: { label: "Hoàn tất", className: "bg-success/10 text-success border-success/20" },
  running: { label: "Đang chạy", className: "bg-info/10 text-info border-info/20" },
  failed: { label: "Lỗi", className: "bg-destructive/10 text-destructive border-destructive/20" },
  new: { label: "Mới", className: "bg-info/10 text-info border-info/20" },
  interview: { label: "Phỏng vấn", className: "bg-warning/10 text-warning-foreground border-warning/30" },
  offer: { label: "Đã offer", className: "bg-success/10 text-success border-success/20" },
  rejected: { label: "Từ chối", className: "bg-destructive/10 text-destructive border-destructive/20" },
};

export const RISK_BADGE: Record<string, string> = {
  critical: "bg-destructive/10 text-destructive border-destructive/20",
  high: "bg-warning/10 text-warning-foreground border-warning/30",
  medium: "bg-info/10 text-info border-info/20",
  low: "bg-muted text-muted-foreground border-border",
};
