-- Add the TH Group Label service (route /thg-label), the 5th TH Group service.
-- Idempotent: services / services_i18n use INSERT OR IGNORE and the bullets are
-- guarded by NOT EXISTS, so re-running never overwrites CMS edits or duplicates.
--
-- DEPLOY ORDER: (1) merge/deploy this CMS code (it accepts primary_service=label
-- on POST /api/v1/leads), (2) deploy the landing that serves /thg-label,
-- (3) apply THIS migration: the row is 'live', so the homepage services grid
-- links to /thg-label as soon as it lands, (4) purge the cms KV cache
-- (migrations skip bumpCmsRev()).

INSERT OR IGNORE INTO services (id, position, icon, status) VALUES ('thg-label', 5, '🏷️', 'live');

INSERT OR IGNORE INTO services_i18n (service_id, locale, name, tagline, hero_eyebrow, hero_title, hero_sub, cta_text, cta_url, body_md) VALUES
  ('thg-label', 'en',
    'TH Group Label',
    'USPS, UPS, FedEx, DHL labels below retail',
    'TH GROUP SERVICE NO. 5',
    'USPS, UPS, FedEx and DHL labels below retail',
    'Genuine labels connected directly to the carriers, charged at exactly the quoted price',
    'Get a free quote',
    '/thg-label',
    'Buy genuine USPS, UPS, FedEx and DHL shipping labels 1–5% below retail. Create labels in the Seller Portal, by bulk import or through the API, with one Label wallet and Vietnamese-speaking support.'),

  ('thg-label', 'vi',
    'TH Group Label',
    'Label USPS, UPS, FedEx, DHL giá thấp hơn bán lẻ',
    'DỊCH VỤ THỨ 5 CỦA TH GROUP',
    'Label USPS, UPS, FedEx, DHL giá thấp hơn bán lẻ',
    'Label chính thống, đấu nối trực tiếp tới hãng vận chuyển, trừ ví đúng giá đã báo',
    'Nhận báo giá miễn phí',
    '/thg-label',
    'Mua label USPS, UPS, FedEx, DHL chính thống thấp hơn giá bán lẻ 1–5%. Tạo label trên Seller Portal, import hàng loạt hoặc API, một ví Label và hỗ trợ tiếng Việt.'),

  ('thg-label', 'zh',
    'TH Group Label',
    '低于零售价的 USPS、UPS、FedEx、DHL 面单',
    'TH GROUP 第 5 项服务',
    '低于零售价的 USPS、UPS、FedEx、DHL 面单',
    '直连承运商的正规面单，按报价精确扣款',
    '获取免费报价',
    '/thg-label',
    '以低于零售价 1–5% 的价格购买正规 USPS、UPS、FedEx、DHL 面单。可通过卖家后台、批量导入或 API 创建面单，一个面单钱包，并提供越南语支持。');

-- service_bullets has no unique key, so OR IGNORE would not protect a replay:
-- guard on the service instead.
INSERT INTO service_bullets (service_id, locale, position, text)
SELECT column1, column2, column3, column4 FROM (VALUES
  ('thg-label', 'en', 1, '1–5% below retail on USPS, UPS, FedEx, DHL'),
  ('thg-label', 'en', 2, 'Quoted price is the price charged'),
  ('thg-label', 'en', 3, 'Seller Portal, bulk import, API & Webhooks'),
  ('thg-label', 'en', 4, 'Vietnamese-speaking support, insured'),
  ('thg-label', 'vi', 1, 'Giảm 1–5% so với giá bán lẻ USPS, UPS, FedEx, DHL'),
  ('thg-label', 'vi', 2, 'Giá báo trước, trừ ví đúng giá'),
  ('thg-label', 'vi', 3, 'Seller Portal, import hàng loạt, API & Webhooks'),
  ('thg-label', 'vi', 4, 'Hỗ trợ tiếng Việt, có bảo hiểm'),
  ('thg-label', 'zh', 1, 'USPS、UPS、FedEx、DHL 比零售价低 1–5%'),
  ('thg-label', 'zh', 2, '报价即扣款价'),
  ('thg-label', 'zh', 3, '卖家后台、批量导入、API 与 Webhook'),
  ('thg-label', 'zh', 4, '越南语支持，含保险')
)
WHERE NOT EXISTS (SELECT 1 FROM service_bullets WHERE service_id = 'thg-label');
