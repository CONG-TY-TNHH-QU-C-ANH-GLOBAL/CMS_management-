-- Add THG Dropship service (route /thg-order) — was missing from initial migration.
-- Idempotent: INSERT OR IGNORE skips if row already exists.

INSERT OR IGNORE INTO services (id, position, icon, status) VALUES ('thg-order', 4, '🛒', 'live');

INSERT OR IGNORE INTO services_i18n (service_id, locale, name, tagline, hero_eyebrow, hero_title, hero_sub, cta_text, cta_url, body_md) VALUES
  ('thg-order', 'en',
    'THG Dropship',
    'Buy from China — delivered to your door in USA',
    'CROSS-BORDER PURCHASING',
    'Buy from China — Direct to USA',
    'Safe Taobao & 1688 sourcing for Vietnamese Americans',
    'Get Free Consultation',
    '/thg-order',
    'Cross-border sourcing service connecting Vietnamese-American customers to Taobao & 1688 — no language barrier, no scam risk, direct delivery from China to USA.'),

  ('thg-order', 'vi',
    'THG Dropship',
    'Mua hàng Trung Quốc — giao tận nhà tại Mỹ',
    'NGUỒN HÀNG XUYÊN BIÊN GIỚI',
    'Mua hàng Trung Quốc — giao tận tay nước Mỹ',
    'Mua an toàn từ Taobao & 1688 cho người Việt sống tại Mỹ',
    'Nhận tư vấn miễn phí',
    '/thg-order',
    'Dịch vụ sourcing xuyên biên giới giúp người Việt sống tại Mỹ mua hàng từ Taobao, 1688 an toàn — không rào cản ngôn ngữ, không lo bị lừa, giao trực tiếp từ TQ sang Mỹ.'),

  ('thg-order', 'zh',
    'THG代发',
    '从中国采购 — 直达美国家门口',
    '跨境采购',
    '从中国采购 — 送达美国家门口',
    '为在美越南人提供安全的淘宝和1688采购',
    '获取免费咨询',
    '/thg-order',
    '跨境采购服务，帮助在美越南人安全购买淘宝和1688商品 — 无语言障碍、无诈骗风险、直接从中国送达美国。');

INSERT OR IGNORE INTO service_bullets (service_id, locale, position, text) VALUES
  ('thg-order', 'en', 1, 'Trusted Taobao & 1688 sourcing'),
  ('thg-order', 'en', 2, 'No language barrier — Vietnamese support'),
  ('thg-order', 'en', 3, 'Direct CN → US shipping, no Vietnam transit'),
  ('thg-order', 'en', 4, '24/7 dedicated customer care'),
  ('thg-order', 'vi', 1, 'Sourcing Taobao & 1688 uy tín'),
  ('thg-order', 'vi', 2, 'Không rào cản ngôn ngữ — hỗ trợ tiếng Việt'),
  ('thg-order', 'vi', 3, 'Giao trực tiếp TQ → Mỹ, không qua Việt Nam'),
  ('thg-order', 'vi', 4, 'CSKH chuyên trách 24/7'),
  ('thg-order', 'zh', 1, '可信的淘宝和1688代采'),
  ('thg-order', 'zh', 2, '无语言障碍 — 提供越南语支持'),
  ('thg-order', 'zh', 3, 'CN → US直接发货，不经过越南'),
  ('thg-order', 'zh', 4, '24/7专属客户支持');
