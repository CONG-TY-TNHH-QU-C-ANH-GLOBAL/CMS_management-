-- Keep the CMS translation control plane aligned with the landing fallback.
--
-- The landing client first hydrates prerendered static copy, then overlays
-- /api/v1/translations. The original 0022 seed still contains the former
-- "US Domestic Pricing" naming, which made the UI visibly switch back after
-- hydration. This deliberate upsert supersedes that legacy copy.

INSERT INTO translations (key, locale, value, updated_at, updated_by) VALUES
  ('nav.domestic_pricing', 'en', '3PL Warehouse Rates', unixepoch(), NULL),
  ('nav.domestic_pricing', 'vi', 'Biểu phí cước 3PL', unixepoch(), NULL),
  ('nav.domestic_pricing', 'zh', '3PL仓库费率', unixepoch(), NULL),

  ('nav.domestic_pricing_desc', 'en', 'US storage, pick-pack and domestic shipping rates', unixepoch(), NULL),
  ('nav.domestic_pricing_desc', 'vi', 'Phí lưu kho, pick-pack và vận chuyển nội địa Mỹ', unixepoch(), NULL),
  ('nav.domestic_pricing_desc', 'zh', '美国仓储、拣货打包及境内运费', unixepoch(), NULL),

  ('domestic.hero_title', 'en', '3PL Warehouse', unixepoch(), NULL),
  ('domestic.hero_title', 'vi', 'Biểu phí cước', unixepoch(), NULL),
  ('domestic.hero_title', 'zh', '3PL仓库', unixepoch(), NULL),

  ('domestic.hero_highlight', 'en', 'Rate Card', unixepoch(), NULL),
  ('domestic.hero_highlight', 'vi', '3PL', unixepoch(), NULL),
  ('domestic.hero_highlight', 'zh', '费率表', unixepoch(), NULL),

  ('domestic.hero_desc', 'en', 'Transparent storage, pick-pack and US domestic shipping from', unixepoch(), NULL),
  ('domestic.hero_desc', 'vi', 'Phí lưu kho, pick-pack và vận chuyển nội địa Mỹ minh bạch từ', unixepoch(), NULL),
  ('domestic.hero_desc', 'zh', '透明的仓储、拣货打包及美国境内配送服务，来自', unixepoch(), NULL),

  ('domestic.table_title', 'en', 'USPS Ground Advantage by Zone', unixepoch(), NULL),
  ('domestic.table_title', 'vi', 'USPS Ground Advantage theo zone', unixepoch(), NULL),
  ('domestic.table_title', 'zh', 'USPS Ground Advantage分区费率', unixepoch(), NULL),

  ('domestic.table_desc', 'en', 'Published reference rates • Zones 1–8', unixepoch(), NULL),
  ('domestic.table_desc', 'vi', 'Biểu phí tham khảo • Zone 1–8', unixepoch(), NULL),
  ('domestic.table_desc', 'zh', '公开参考费率 • Zone 1–8', unixepoch(), NULL),

  ('seo.domestic_pricing_title', 'en', 'US 3PL Warehouse Rates: Storage, Pick & Pack, Shipping | THG', unixepoch(), NULL),
  ('seo.domestic_pricing_title', 'vi', 'Biểu phí cước 3PL Mỹ: lưu kho, pick-pack, vận chuyển | THG', unixepoch(), NULL),
  ('seo.domestic_pricing_title', 'zh', '美国3PL仓库费率：仓储、拣货打包与配送 | THG', unixepoch(), NULL),

  ('seo.domestic_pricing_desc', 'en', 'Transparent US 3PL rates for storage, pick and pack, packaging and USPS Ground Advantage shipping across zones 1–8.', unixepoch(), NULL),
  ('seo.domestic_pricing_desc', 'vi', 'Biểu phí cước 3PL Mỹ minh bạch cho lưu kho, pick & pack, bao bì và USPS Ground Advantage theo zone 1–8.', unixepoch(), NULL),
  ('seo.domestic_pricing_desc', 'zh', '透明的美国3PL仓储、拣货打包、包装及USPS Ground Advantage 1–8区费率。', unixepoch(), NULL)
ON CONFLICT (key, locale) DO UPDATE SET
  value = excluded.value,
  updated_at = unixepoch(),
  updated_by = NULL;
