-- 0012: bootstrap homepage page row + homepage_blocks for "/" landing.
--
-- Backs the /admin/content/landing block editor with persistent storage.
-- Each block has a `kind` (hero/trust/...) and a `payload_json` matching the
-- per-locale fields the admin form edits. Seeded with the same default
-- values that previously lived in the INITIAL array of landing/index.tsx,
-- across all 3 locales (en/vi/zh — same VN copy used for all 3 for now;
-- operator translates per locale in admin).
--
-- Run-safe: uses INSERT OR IGNORE for page rows so re-applying won't duplicate.

INSERT OR IGNORE INTO pages (route, locale, title, status)
VALUES
  ('/', 'en', 'THG Fulfill', 'live'),
  ('/', 'vi', 'THG Fulfill', 'live'),
  ('/', 'zh', 'THG Fulfill', 'live');

-- ── HERO block — present for vi (and en/zh share until operator translates)
INSERT INTO homepage_blocks (page_id, kind, position, payload_json, locale)
SELECT id, 'hero', 0,
  '{"eyebrow":"Fulfill từ Việt Nam đi toàn cầu","title":"POD & Dropship fulfillment cho seller TikTok Shop, Shopify, Amazon","sub":"Air freight VN/CN → US 5–8 ngày, kho US domestic từ $1.20/đơn, tracking real-time.","cta1":"Nhận báo giá miễn phí","cta2":"Xem dịch vụ","media":"/assets/hero-world-map.jpg"}',
  locale
FROM pages WHERE route = '/' AND NOT EXISTS (
  SELECT 1 FROM homepage_blocks WHERE page_id = pages.id AND kind = 'hero' AND locale = pages.locale
);

INSERT INTO homepage_blocks (page_id, kind, position, payload_json, locale)
SELECT id, 'trust', 1,
  '{"stat1":"500K+ đơn / tháng","stat2":"98.7% giao đúng hẹn","stat3":"4 kho US + VN + CN","stat4":"1500+ seller tin dùng"}',
  locale
FROM pages WHERE route = '/' AND NOT EXISTS (
  SELECT 1 FROM homepage_blocks WHERE page_id = pages.id AND kind = 'trust' AND locale = pages.locale
);

INSERT INTO homepage_blocks (page_id, kind, position, payload_json, locale)
SELECT id, 'services_grid', 2,
  '{"title":"Hệ sinh thái fulfillment khép kín","sub":"Từ in ấn POD, vận chuyển quốc tế đến kho US — bạn chỉ cần lo bán hàng."}',
  locale
FROM pages WHERE route = '/' AND NOT EXISTS (
  SELECT 1 FROM homepage_blocks WHERE page_id = pages.id AND kind = 'services_grid' AND locale = pages.locale
);

INSERT INTO homepage_blocks (page_id, kind, position, payload_json, locale)
SELECT id, 'about_video', 3,
  '{"video_url":"https://www.youtube.com/watch?v=Cvj8kqFMLfk","title":"Tìm hiểu THG qua video","sub":"Một phút để hiểu cách THG vận hành kho và shipping toàn cầu.","highlight1":"Pick-pack siêu tốc","highlight2":"Vận chuyển quốc tế","highlight3":"Phủ sóng toàn cầu","highlight4":"An toàn — bảo hiểm"}',
  locale
FROM pages WHERE route = '/' AND NOT EXISTS (
  SELECT 1 FROM homepage_blocks WHERE page_id = pages.id AND kind = 'about_video' AND locale = pages.locale
);

INSERT INTO homepage_blocks (page_id, kind, position, payload_json, locale)
SELECT id, 'process', 4,
  '{"step1":"Đơn hàng đổ về qua API","step2":"Pick-pack tại kho gần nhất","step3":"Ship đi — tracking đồng bộ","step4":"Báo cáo chi phí real-time"}',
  locale
FROM pages WHERE route = '/' AND NOT EXISTS (
  SELECT 1 FROM homepage_blocks WHERE page_id = pages.id AND kind = 'process' AND locale = pages.locale
);

INSERT INTO homepage_blocks (page_id, kind, position, payload_json, locale)
SELECT id, 'integrations', 5,
  '{"title":"Tích hợp sẵn các nền tảng bạn đang bán"}',
  locale
FROM pages WHERE route = '/' AND NOT EXISTS (
  SELECT 1 FROM homepage_blocks WHERE page_id = pages.id AND kind = 'integrations' AND locale = pages.locale
);

INSERT INTO homepage_blocks (page_id, kind, position, payload_json, locale)
SELECT id, 'testimonials', 6,
  '{"title":"Hàng nghìn seller đã chọn THG","sub":"Câu chuyện thật từ POD seller US, EU, UK."}',
  locale
FROM pages WHERE route = '/' AND NOT EXISTS (
  SELECT 1 FROM homepage_blocks WHERE page_id = pages.id AND kind = 'testimonials' AND locale = pages.locale
);

INSERT INTO homepage_blocks (page_id, kind, position, payload_json, locale)
SELECT id, 'faq', 7,
  '{"title":"Câu hỏi thường gặp"}',
  locale
FROM pages WHERE route = '/' AND NOT EXISTS (
  SELECT 1 FROM homepage_blocks WHERE page_id = pages.id AND kind = 'faq' AND locale = pages.locale
);

INSERT INTO homepage_blocks (page_id, kind, position, payload_json, locale)
SELECT id, 'contact', 8,
  '{"title":"Sẵn sàng scale đơn hàng quốc tế?","sub":"Đội sales tư vấn miễn phí trong 15 phút.","cta":"Đặt lịch tư vấn"}',
  locale
FROM pages WHERE route = '/' AND NOT EXISTS (
  SELECT 1 FROM homepage_blocks WHERE page_id = pages.id AND kind = 'contact' AND locale = pages.locale
);
