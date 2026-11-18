-- Landing copy for the USPS Ground Advantage label rate card (see 0071).
--
-- CMS translations override the landing's built-in strings. The landing now
-- shows Zone 1-9 on /domestic-pricing and a per-tier rate table on
-- /thg-label#pricing instead of "1% to 5%" discount cards, so any CMS row that
-- still holds the old wording would keep the old copy on the site. Each
-- statement only touches a row whose value is still exactly the old text, so
-- an editor's own wording is left alone and a re-run is a no-op.
--
-- Undo (restores the old wording on the rows changed here):
--   UPDATE translations SET value = REPLACE(value, '1–9', '1–8') WHERE key = 'domestic.table_desc';
--   label_page.* rows: set back to the "old" values listed below.

UPDATE translations SET value = REPLACE(value, '1–8', '1–9'), updated_at = unixepoch()
WHERE key = 'domestic.table_desc'
  AND value IN ('Published reference rates • Zones 1–8', 'Biểu phí tham khảo • Zone 1–8', '公开参考费率 • Zone 1–8');

-- label_page.price_title
UPDATE translations SET value = 'USPS Ground Advantage label rates by volume tier', updated_at = unixepoch()
WHERE key = 'label_page.price_title' AND locale = 'en' AND value = 'The more you buy, the deeper the discount: 1% to 5%.';
UPDATE translations SET value = 'Bảng giá label USPS Ground Advantage theo bậc sản lượng', updated_at = unixepoch()
WHERE key = 'label_page.price_title' AND locale = 'vi' AND value = 'Mua càng nhiều, giảm càng sâu: từ 1% đến 5%.';
UPDATE translations SET value = 'USPS Ground Advantage 面单价格（按量级档位）', updated_at = unixepoch()
WHERE key = 'label_page.price_title' AND locale = 'zh' AND value = '买得越多折扣越大：1% 至 5%。';

-- label_page.price_sub
UPDATE translations SET value = 'Five tiers by monthly label volume. Each tier lists the price per label in USD by weight and Zone 1–9.', updated_at = unixepoch()
WHERE key = 'label_page.price_sub' AND locale = 'en' AND value = 'Discounts apply to each carrier''s and service''s retail price, based on your monthly label volume.';
UPDATE translations SET value = '5 bậc theo số label mỗi tháng. Mỗi bậc là giá một label (USD) theo cân nặng và Zone 1–9.', updated_at = unixepoch()
WHERE key = 'label_page.price_sub' AND locale = 'vi' AND value = 'Mức giảm tính trên giá bán lẻ của từng hãng và dịch vụ, tùy lượng label khách mua mỗi tháng.';
UPDATE translations SET value = '按每月面单量分为 5 档。每档列出按重量和 Zone 1–9 计算的单张面单价格（美元）。', updated_at = unixepoch()
WHERE key = 'label_page.price_sub' AND locale = 'zh' AND value = '折扣基于各承运商和服务的零售价，取决于您每月的面单量。';

-- label_page.price_note
UPDATE translations SET value = 'Other carriers and services are quoted on request.', updated_at = unixepoch()
WHERE key = 'label_page.price_note' AND locale = 'en' AND value = 'Volume bands for each tier are confirmed by TH Group when you request a quote.';
UPDATE translations SET value = 'Các hãng và dịch vụ khác báo giá theo yêu cầu.', updated_at = unixepoch()
WHERE key = 'label_page.price_note' AND locale = 'vi' AND value = 'Dải sản lượng của từng bậc sẽ do TH Group xác nhận khi báo giá.';
UPDATE translations SET value = '其他承运商和服务可按需报价。', updated_at = unixepoch()
WHERE key = 'label_page.price_note' AND locale = 'zh' AND value = '各档位的量级区间由 TH Group 在报价时确认。';

-- label_page.calc_note (drop "exact discounts follow the volume tiers in Pricing")
UPDATE translations SET value = 'Results are estimates; official quotes depend on carrier and service.', updated_at = unixepoch()
WHERE key = 'label_page.calc_note' AND locale = 'en' AND value = 'Exact discounts follow the volume tiers in Pricing. Results are estimates; official quotes depend on carrier and service.';
UPDATE translations SET value = 'Kết quả là ước tính, báo giá chính thức theo từng hãng và dịch vụ.', updated_at = unixepoch()
WHERE key = 'label_page.calc_note' AND locale = 'vi' AND value = 'Mức giảm cụ thể theo bậc sản lượng ở mục Bảng giá. Kết quả là ước tính, báo giá chính thức theo từng hãng và dịch vụ.';
UPDATE translations SET value = '结果仅为估算，正式报价取决于承运商和服务。', updated_at = unixepoch()
WHERE key = 'label_page.calc_note' AND locale = 'zh' AND value = '具体折扣以价格部分的量级为准。结果仅为估算，正式报价取决于承运商和服务。';

-- label_page.tier: the tabs read "Tier n" like the workbook.
UPDATE translations SET value = 'Tier', updated_at = unixepoch()
WHERE key = 'label_page.tier' AND ((locale = 'vi' AND value = 'Bậc') OR (locale = 'zh' AND value = '档位'));
