// Mock data cho THG Content OS (CMS prototype)

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
  { id: 3, who: "Khôi Vũ", action: "yêu cầu cập nhật giá", target: "Epacket US line", time: "34 phút trước", type: "change" },
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
  { id: "s1", name: "Cross-border Fulfillment", icon: "📦", priceFrom: "$2.50", routes: 12, status: "active" },
  { id: "s2", name: "POD Print on Demand", icon: "🎨", priceFrom: "$4.20", routes: 8, status: "active" },
  { id: "s3", name: "Warehousing VN", icon: "🏭", priceFrom: "$0.80/m³", routes: 3, status: "active" },
  { id: "s4", name: "Amazon FBA Prep", icon: "📋", priceFrom: "$1.50", routes: 5, status: "draft" },
  { id: "s5", name: "TikTok Shop Logistics", icon: "🎵", priceFrom: "$3.10", routes: 6, status: "active" },
];

export const PRICING = [
  { id: "p1", line: "Epacket US", from: "$8.50/kg", time: "10–15 ngày", min: "50g", max: "2kg", status: "live" },
  { id: "p2", line: "DHL Express US", from: "$22.00/kg", time: "3–5 ngày", min: "100g", max: "30kg", status: "live" },
  { id: "p3", line: "TikTok Line VN→US", from: "$11.20/kg", time: "7–10 ngày", min: "50g", max: "5kg", status: "review" },
  { id: "p4", line: "Sea Freight LCL", from: "$1.80/kg", time: "30–45 ngày", min: "100kg", max: "—", status: "live" },
];

export const FAQS = [
  { id: "f1", q: "Tôi cần giấy tờ gì để bán trên TikTok Shop US?", category: "TikTok Shop", views: 1240, updated: "2 ngày" },
  { id: "f2", q: "Thời gian ship trung bình từ VN đến US?", category: "Vận chuyển", views: 980, updated: "1 tuần" },
  { id: "f3", q: "Có hỗ trợ COD không?", category: "Thanh toán", views: 760, updated: "2 tuần" },
  { id: "f4", q: "Phí lưu kho tính như thế nào?", category: "Warehouse", views: 540, updated: "1 tháng" },
  { id: "f5", q: "Có ship hàng pin lithium không?", category: "Hải quan", views: 420, updated: "2 tháng" },
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
  { id: "cr1", title: "Đổi giá Epacket US theo tháng 3", target: "Pricing", by: "Khôi Vũ", status: "open", priority: "high", time: "2 giờ" },
  { id: "cr2", title: "Cập nhật ảnh hero homepage", target: "Landing", by: "Linh Trần", status: "open", priority: "medium", time: "5 giờ" },
  { id: "cr3", title: "Thêm service Amazon FBA Prep", target: "Services", by: "Hoa Lê", status: "in_review", priority: "medium", time: "1 ngày" },
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
  review: { label: "Chờ duyệt", className: "bg-warning/10 text-warning-foreground border-warning/30" },
  in_review: { label: "Đang duyệt", className: "bg-warning/10 text-warning-foreground border-warning/30" },
  draft: { label: "Bản nháp", className: "bg-muted text-muted-foreground border-border" },
  open: { label: "Mở", className: "bg-info/10 text-info border-info/20" },
  done: { label: "Hoàn tất", className: "bg-success/10 text-success border-success/20" },
  running: { label: "Đang chạy", className: "bg-info/10 text-info border-info/20" },
  failed: { label: "Lỗi", className: "bg-destructive/10 text-destructive border-destructive/20" },
};

export const RISK_BADGE: Record<string, string> = {
  critical: "bg-destructive/10 text-destructive border-destructive/20",
  high: "bg-warning/10 text-warning-foreground border-warning/30",
  medium: "bg-info/10 text-info border-info/20",
  low: "bg-muted text-muted-foreground border-border",
};
