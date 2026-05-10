## Mục tiêu

CMS nội bộ cho team THG Fulfill quản trị toàn bộ nội dung trên `thgfulfill.com`. Vẫn là **prototype mock data** (chưa nối backend), nhưng phải:

- Bao phủ **đủ mọi section** website hiện tại + các module phụ trợ (blog, pricing, tuyển dụng, gallery, marketplace…).
- UX gọn, ít click, có **inline editor** thật sự để cảm giác "sửa được" chứ không chỉ list.
- Mỗi page CMS map 1–1 với 1 phần nội dung trên landing → người dùng vào là biết đang sửa cái gì.

---

## Mapping CMS ↔ thgfulfill.com

Mọi block đang hard-code trên website đều có trang quản trị tương ứng:

```text
Landing sections (8)         → Hero, Trust Bar, Services Grid, Why Us,
                                How It Works, Marketplace, Testimonials, CTA
Service detail pages         → THG Fulfill, THG Express, THG Warehouse
Pricing — Quốc tế            → tuyến air freight VN/CN → US/UK/EU
Pricing — Nội địa US         → US domestic fulfillment từ $1.2
Blog                         → bài viết kiến thức bán hàng
Tuyển dụng (Careers)         → job posts + form ứng tuyển
FAQ                          → Q&A theo nhóm
Testimonials                 → review khách hàng
Marketplace integrations     → Etsy, Amazon, TikTok Shop, eBay, Shopify, Woo
Gallery (warehouse photos)   → grid ảnh kho thật
Offices & Contact            → 4 địa chỉ VN/US/CN + hotline + email
Policies                     → refund, privacy, terms, shipping
Media Library                → ảnh + tệp dùng chung
Agent Studio (mock)          → giữ nguyên cho future
Users / Audit / Telegram     → vận hành nội bộ
```

---

## Các thay đổi UX chính

### 1. Sidebar gom nhóm lại theo "đúng trang web"
Thay vì nhóm chung chung "Content", chia theo cấu trúc website giúp người mới hiểu ngay:

```text
DASHBOARD
LANDING PAGE          (8 section của trang chủ)
SERVICES              (3 service detail pages)
PRICING               ├─ Quốc tế (Express)
                      └─ Nội địa US (Warehouse)
BLOG
CAREERS               (mới)
TESTIMONIALS          (mới — tách ra)
FAQ
MARKETPLACES          (mới)
GALLERY               (mới)
CONTACT & OFFICES     (mới)
POLICIES
MEDIA LIBRARY
─────────────
AGENT STUDIO          (jobs, sources, change requests)
REVIEWS               (chờ duyệt + lịch sử)
─────────────
SETTINGS              (users, telegram, audit, brand)
```

### 2. Landing Page — section editor đúng nghĩa

Mỗi section có **panel chỉnh từng field** + **live preview kế bên**:

```text
┌──────────────────────┬──────────────────────┐
│ Hero Section         │   [Live preview]     │
│ ────────────────     │   render mini của    │
│ Eyebrow:  [_______]  │   section đang sửa   │
│ Title:    [_______]  │   update realtime    │
│ Sub:      [_______]  │   khi gõ             │
│ CTA text: [_______]  │                      │
│ CTA url:  [_______]  │                      │
│ BG image: [upload]   │                      │
│                      │                      │
│ [Cancel] [Save draft]│                      │
└──────────────────────┴──────────────────────┘
```

- Tab **Desktop / Mobile** trên preview.
- Nút "Xem trên trang thật" mở `thgfulfill.com` ở tab mới.
- Mỗi section có badge **đã sửa / đang chờ duyệt / live**.

### 3. Pricing tách 2 trang

- **Pricing Quốc tế**: bảng tuyến air freight (Express) — VN→US, CN→US, VN→UK, VN→EU… với min/max weight, ETA, giá/kg.
- **Pricing Nội địa US**: bảng fulfill từ kho PA & NC — pick&pack, storage, tier theo volume.

Mỗi tuyến có **price history** (xem giá đã từng đổi qua các tháng) và **effective date** sắp tới.

### 4. Careers (mới)

- Danh sách job: title, location, type (full-time/part-time/intern), trạng thái mở/đóng, số ứng viên.
- Editor job: mô tả, yêu cầu, quyền lợi (rich text mock), deadline, link ứng tuyển.
- Inbox ứng viên (mock): tên, vị trí, CV, ngày nộp, trạng thái (mới / phỏng vấn / từ chối / nhận).

### 5. Testimonials (mới)

- Grid card review: avatar emoji cờ, tên, role, kênh, trích dẫn, rating.
- Toggle "hiển thị trên homepage", sắp xếp drag-handle.

### 6. Marketplaces (mới)

Quản lý 6 logo + status "Sync Ready / Coming soon" + link docs.

### 7. Gallery (mới, tách khỏi Media)

- Grid ảnh kho hàng.
- Drag-reorder, bulk-publish, alt text per image (cho SEO).

### 8. Contact & Offices (mới)

- Card cho từng văn phòng: tên, địa chỉ, số điện thoại, map embed.
- Hotline / Email / form CTA chính.

### 9. Service detail (THG Fulfill / Express / Warehouse)

Mỗi service một trang riêng để chỉnh:
- Hero của trang service.
- Bullet points USP.
- Pricing block nhúng từ Pricing.
- FAQ riêng theo service.

### 10. Tinh chỉnh chung

- **Inline editing**: title/text click thẳng để sửa thay vì mở modal.
- **Command palette** (⌘K) thật sự jump tới mọi section.
- **Sticky save bar** dưới cùng mỗi trang khi có thay đổi chưa lưu, nhắc "Bạn có 3 thay đổi chưa publish".
- **Breadcrumb** + back button rõ ràng cho service / pricing detail.
- **Empty state** đẹp (icon + 1 dòng giải thích + CTA chính) cho mọi danh sách rỗng.
- **Toast** xác nhận thao tác (mock).
- **Skeleton loading** cho cảm giác app thật.

---

## Mock data sẽ thêm

```text
SERVICE_PAGES        (3 pages × ~10 fields)
PRICING_INTL         (~8 tuyến)
PRICING_US           (~6 dòng)
CAREERS_JOBS         (5–7 job)
CAREERS_APPLICANTS   (10–15 ứng viên)
TESTIMONIALS         (8–10 review)
MARKETPLACES         (6 platform)
GALLERY              (12 ảnh kho thật từ thgfulfill.com)
OFFICES              (4 địa chỉ)
LANDING_SECTIONS     (mở rộng theo trang thật)
```

Sẽ dùng đúng các ảnh kho từ `w.ladicdn.com` và logo `thg-logo` thật để CMS trông đáng tin.

---

## Kỹ thuật

- TanStack Router file-based — thêm các route file mới: `services.thg-fulfill.tsx`, `services.thg-express.tsx`, `services.thg-warehouse.tsx`, `pricing.intl.tsx`, `pricing.us.tsx`, `careers.tsx`, `careers.$jobId.tsx`, `testimonials.tsx`, `marketplaces.tsx`, `gallery.tsx`, `contact.tsx`.
- Tạo 1 layout route `pricing.tsx` và `services.tsx` bọc Outlet để có sub-tab.
- Component dùng chung mới: `<InlineEdit>`, `<SectionEditor>`, `<PreviewFrame>`, `<StickySaveBar>`, `<EmptyState>`, `<CommandPalette>`, `<Drawer>` (cho job detail / applicant detail).
- Vẫn theo design system Stripe-style đã có, không thêm màu mới.
- Mọi state vẫn `useState` local (mock) — sẵn slot để sau này thay bằng React Query + Lovable Cloud.

---

## Những thứ KHÔNG làm trong vòng này

- Không bật Lovable Cloud, không tạo schema thật.
- Không nối API thật vào thgfulfill.com.
- Agent Studio giữ UI hiện tại — chưa gắn LLM.
- Không build trang public render data từ CMS (đã chốt: chỉ CMS).

Sau khi bạn duyệt plan, tôi sẽ implement tuần tự: sidebar mới → các trang mới → polish UX (inline edit, command palette, sticky save bar).
