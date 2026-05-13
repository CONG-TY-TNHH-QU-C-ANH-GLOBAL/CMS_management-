-- Seed initial 25 glossary terms for the AI translation pipeline.
-- Curation rules (see docs/ai-localization-spec.md §13):
--   ✓ Repeated domain vocabulary (terms used across 3+ pages)
--   ✓ Brand-critical phrases (THG product names)
--   ✓ Operational terminology (shipping / carrier specific)
--   ✗ NO generic sentences, CTA copy, marketing lines
--   ✗ NO numbers / prices / addresses (handled by prompt rules)
--
-- Priority scale: 0 (default) → 100. Higher = matched first within same length.
-- Brand names get priority=100 (must never be retranslated).
--
-- Idempotency: re-runnable. Conflicting `term_vi` (UNIQUE) is ignored via
-- INSERT OR IGNORE so the seed can be re-applied after CRUD edits without
-- clobbering operator changes.

-- ── brand (5) — never retranslate proper names ────────────────────────
INSERT OR IGNORE INTO glossary (term_vi, term_en, term_zh, category, priority, notes) VALUES
  ('THG Fulfill',    'THG Fulfill',    'THG Fulfill',    'brand', 100, 'Brand name — never translate'),
  ('THG Express',    'THG Express',    'THG Express',    'brand', 100, 'Brand name — never translate'),
  ('THG Warehouse',  'THG Warehouse',  'THG Warehouse',  'brand', 100, 'Brand name — never translate'),
  ('THG Dropship',   'THG Dropship',   'THG代发',         'brand', 100, 'Brand name — ZH localized'),
  ('THG Order',      'THG Order',      'THG代购',         'brand', 100, 'Brand name — ZH localized');

-- ── warehouse (4) ────────────────────────────────────────────────────
INSERT OR IGNORE INTO glossary (term_vi, term_en, term_zh, category, priority, notes) VALUES
  ('Kho Trung Quốc', 'China warehouse',   '中国仓库',  'warehouse', 50, 'Disambiguate from generic "warehouse"'),
  ('Kho Việt Nam',   'Vietnam warehouse', '越南仓库',  'warehouse', 50, NULL),
  ('Kho Mỹ',         'US warehouse',      '美国仓库',  'warehouse', 50, NULL),
  ('Hệ thống OMS',   'OMS system',        'OMS系统',   'warehouse', 30, 'Order Management System');

-- ── shipping (6) ─────────────────────────────────────────────────────
INSERT OR IGNORE INTO glossary (term_vi, term_en, term_zh, category, priority, notes) VALUES
  ('Hàng lô',                'bulk shipping',     '散货海运',  'shipping', 50, 'Sea-freight bulk lane'),
  ('Hàng không thường',      'standard air',      '标准空运',  'shipping', 40, 'Epacket / Yun Express lane'),
  ('Hàng không nhanh',       'express air',       '快速空运',  'shipping', 40, 'DHL / FedEx lane'),
  ('Đường biển',             'sea freight',       '海运',      'shipping', 30, NULL),
  ('Trọng lượng thể tích',   'volumetric weight', '体积重量',  'shipping', 60, 'L×W×H ÷ divisor'),
  ('Vùng sâu',               'remote area',       '偏远地区',  'shipping', 30, 'USPS remote-area surcharge zones');

-- ── ecommerce (7 — incl. platforms) ──────────────────────────────────
INSERT OR IGNORE INTO glossary (term_vi, term_en, term_zh, category, priority, notes) VALUES
  ('TMĐT',                'e-commerce',          '电商',         'ecommerce', 20, 'Common VN abbreviation'),
  ('Seller',              'seller',              '卖家',         'ecommerce', 10, NULL),
  ('POD',                 'print-on-demand',     '按需印刷',     'ecommerce', 30, 'Acronym — keep in EN'),
  ('Order hộ',            'proxy purchasing',    '代购',         'ecommerce', 40, 'Vietnamese-specific service'),
  ('Tracking real-time',  'real-time tracking',  '实时追踪',     'ecommerce', 20, NULL),
  ('TikTok Shop',         'TikTok Shop',         'TikTok Shop',  'ecommerce', 80, 'Platform name — never translate'),
  ('1688 / Taobao',       '1688 / Taobao',       '1688 / 淘宝',  'ecommerce', 80, 'Platform names — keep verbatim');

-- ── payments (3) ─────────────────────────────────────────────────────
INSERT OR IGNORE INTO glossary (term_vi, term_en, term_zh, category, priority, notes) VALUES
  ('Đặt cọc',     'deposit',       '定金',  'payments', 20, NULL),
  ('Phí xử lý',   'handling fee',  '处理费', 'payments', 20, NULL),
  ('Phí dịch vụ', 'service fee',   '服务费', 'payments', 20, NULL);
