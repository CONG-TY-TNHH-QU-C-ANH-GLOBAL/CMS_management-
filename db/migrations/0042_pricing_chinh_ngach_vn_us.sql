-- Chính ngạch VN→US pricing tables (MATSON / Sea thường / Air / hải quan xuất).
--
-- Inserted here rather than through the CMS because the CMS has no create path:
-- savePricingTable() throws 404 when the slug does not exist, there is no create
-- action and no "add table" control in the admin. The 21 existing tables were
-- seeded the same way (scripts/bootstrap-pricing.ts + wrangler d1 execute).
--
-- All eight rows land as status = draft. Operations reviews the numbers in the
-- Rate Card Builder and flips them to live; nothing on the landing renders them
-- yet (panels are wired per slug in the Vite app).
--
-- USD columns carry semantic = "money_usd" + currency = "USD" DELIBERATELY.
-- type = "currency" resolves to money_vnd, which is STRICT INTEGER (rateCardParse
-- normalizeCellBySemantic) and would reject or mangle $4.50, $6.05 and $10.5.

INSERT INTO pricing_tables (slug, name, kind, description, schema_json, data_json, version, status)
VALUES ('chinhNgachMatsonLcl', 'Chính ngạch MATSON — Sea LCL', 'weight_grid', 'MATSON CLX/MAX · VN → Long Beach, CA · min 1 CBM · đã gồm BAF. Dense cargo = hàng nặng trên 1 tấn/CBM.',
        '{"type":"weight_grid","columns":[{"code":"origin","label":"Tuyến xuất phát","position":0,"type":"text"},{"code":"light_cbm","label":"Light Cargo (USD/CBM)","position":1,"type":"number","semantic":"money_usd","currency":"USD"},{"code":"dense_mt","label":"Dense Cargo (USD/MT)","position":2,"type":"number","semantic":"money_usd","currency":"USD"},{"code":"destination","label":"Cảng đến","position":3,"type":"text"},{"code":"transit","label":"Transit","position":4,"type":"text"}]}',
        '[{"origin":"Hồ Chí Minh (HCM)","light_cbm":155,"dense_mt":177,"destination":"Long Beach, CA","transit":"17–18 ngày"},{"origin":"Hải Phòng (HPH)","light_cbm":197,"dense_mt":220,"destination":"Long Beach, CA","transit":"17–18 ngày"},{"origin":"Đà Nẵng (DAD) — via HCM hoặc HPH","light_cbm":222,"dense_mt":"","destination":"Long Beach, CA","transit":"17–18 ngày"}]',
        1, 'draft');

INSERT INTO pricing_tables (slug, name, kind, description, schema_json, data_json, version, status)
VALUES ('chinhNgachMatsonSurcharge', 'Chính ngạch MATSON — Phụ phí cảng', 'weight_grid', 'Accessorial charges tuyến MATSON.',
        '{"type":"weight_grid","columns":[{"code":"fee","label":"Loại phí","position":0,"type":"text"},{"code":"amount","label":"Đơn giá (USD)","position":1,"type":"number","semantic":"money_usd","currency":"USD"},{"code":"unit","label":"Đơn vị","position":2,"type":"text"},{"code":"min","label":"Min","position":3,"type":"text"}]}',
        '[{"fee":"Handling Charge","amount":84,"unit":"/ HBL","min":""},{"fee":"Port Security","amount":17,"unit":"/ HBL","min":""},{"fee":"PierPASS","amount":4.5,"unit":"/ CBM","min":"1 CBM"},{"fee":"ISF Filing Fee (if applicable)","amount":34,"unit":"/ HBL","min":""}]',
        1, 'draft');

INSERT INTO pricing_tables (slug, name, kind, description, schema_json, data_json, version, status)
VALUES ('chinhNgachMatsonFcl', 'Chính ngạch MATSON — Sea FCL', 'weight_grid', 'FAK/Garment · chỉ áp dụng sau khi hoàn thành FMC commodity filing · giá áp dụng Jul.1 – TBA. Dòng Total = Ocean Freight + FAF + MAF (đã đối chiếu khớp với nguồn).',
        '{"type":"weight_grid","columns":[{"code":"service","label":"Service","position":0,"type":"text"},{"code":"origin","label":"Tuyến","position":1,"type":"text"},{"code":"charge","label":"Khoản phí","position":2,"type":"text"},{"code":"d20","label":"D20 (USD)","position":3,"type":"number","semantic":"money_usd","currency":"USD"},{"code":"d40","label":"D40 (USD)","position":4,"type":"number","semantic":"money_usd","currency":"USD"},{"code":"d40h","label":"D40H (USD)","position":5,"type":"number","semantic":"money_usd","currency":"USD"},{"code":"d45h","label":"D45H (USD)","position":6,"type":"number","semantic":"money_usd","currency":"USD"},{"code":"transit","label":"Transit","position":7,"type":"text"}]}',
        '[{"service":"CLX","origin":"Hải Phòng → Houston, TX","charge":"Ocean Freight","d20":3820,"d40":4650,"d40h":4750,"d45h":5000,"transit":"25–26 ngày"},{"service":"CLX","origin":"Hải Phòng → Houston, TX","charge":"FAF","d20":1040,"d40":1300,"d40h":1463,"d45h":1646,"transit":"25–26 ngày"},{"service":"CLX","origin":"Hải Phòng → Houston, TX","charge":"MAF","d20":6480,"d40":8100,"d40h":9113,"d45h":10255,"transit":"25–26 ngày"},{"service":"CLX","origin":"Hải Phòng → Houston, TX","charge":"Total","d20":11340,"d40":14050,"d40h":15326,"d45h":16901,"transit":"25–26 ngày"},{"service":"CLX","origin":"Hồ Chí Minh → Houston, TX","charge":"Ocean Freight","d20":3820,"d40":4650,"d40h":4750,"d45h":5000,"transit":"25–26 ngày"},{"service":"CLX","origin":"Hồ Chí Minh → Houston, TX","charge":"FAF","d20":1040,"d40":1300,"d40h":1463,"d45h":1646,"transit":"25–26 ngày"},{"service":"CLX","origin":"Hồ Chí Minh → Houston, TX","charge":"MAF","d20":4640,"d40":5800,"d40h":6525,"d45h":7343,"transit":"25–26 ngày"},{"service":"CLX","origin":"Hồ Chí Minh → Houston, TX","charge":"Total","d20":9500,"d40":11750,"d40h":12738,"d45h":13989,"transit":"25–26 ngày"},{"service":"MAX","origin":"Hải Phòng → Houston, TX","charge":"Ocean Freight","d20":3820,"d40":4650,"d40h":4750,"d45h":5000,"transit":"26–27 ngày"},{"service":"MAX","origin":"Hải Phòng → Houston, TX","charge":"FAF","d20":1040,"d40":1300,"d40h":1463,"d45h":1646,"transit":"26–27 ngày"},{"service":"MAX","origin":"Hải Phòng → Houston, TX","charge":"MAF","d20":6080,"d40":7600,"d40h":8550,"d45h":9622,"transit":"26–27 ngày"},{"service":"MAX","origin":"Hải Phòng → Houston, TX","charge":"Total","d20":10940,"d40":13550,"d40h":14763,"d45h":16268,"transit":"26–27 ngày"},{"service":"MAX","origin":"Hồ Chí Minh → Houston, TX","charge":"Ocean Freight","d20":3820,"d40":4650,"d40h":4750,"d45h":5000,"transit":"26–27 ngày"},{"service":"MAX","origin":"Hồ Chí Minh → Houston, TX","charge":"FAF","d20":1040,"d40":1300,"d40h":1463,"d45h":1646,"transit":"26–27 ngày"},{"service":"MAX","origin":"Hồ Chí Minh → Houston, TX","charge":"MAF","d20":4160,"d40":5200,"d40h":5850,"d45h":6583,"transit":"26–27 ngày"},{"service":"MAX","origin":"Hồ Chí Minh → Houston, TX","charge":"Total","d20":9020,"d40":11150,"d40h":12063,"d45h":13229,"transit":"26–27 ngày"}]',
        1, 'draft');

INSERT INTO pricing_tables (slug, name, kind, description, schema_json, data_json, version, status)
VALUES ('chinhNgachSeaLcl', 'Chính ngạch Sea thường — LCL (W/M)', 'weight_grid', '1 WM = 1 CBM hoặc 1.000 kg, lấy giá trị lớn hơn · min 1 WM · xuất phát từ HCM · 2–3 chuyến/tuần · cut-off ETD−3.',
        '{"type":"weight_grid","columns":[{"code":"route","label":"Tuyến","position":0,"type":"text"},{"code":"price_wm","label":"Cước biển (USD/WM)","position":1,"type":"number","semantic":"money_usd","currency":"USD"},{"code":"transit","label":"Transit","position":2,"type":"text"}]}',
        '[{"route":"HCM → Los Angeles, CA (Bờ Tây)","price_wm":78,"transit":"18–25 ngày"},{"route":"HCM → Houston, TX (Bờ Nam)","price_wm":179,"transit":"30–40 ngày"}]',
        1, 'draft');

INSERT INTO pricing_tables (slug, name, kind, description, schema_json, data_json, version, status)
VALUES ('chinhNgachSeaFcl', 'Chính ngạch Sea thường — FCL', 'weight_grid', 'Cước biển trọn container · xuất phát từ HCM · cut-off ETD−2.',
        '{"type":"weight_grid","columns":[{"code":"route","label":"Tuyến","position":0,"type":"text"},{"code":"gp20","label":"20GP (USD)","position":1,"type":"number","semantic":"money_usd","currency":"USD"},{"code":"hc40","label":"40HC (USD)","position":2,"type":"number","semantic":"money_usd","currency":"USD"},{"code":"transit","label":"Transit","position":3,"type":"text"}]}',
        '[{"route":"HCM → Los Angeles, CA (Bờ Tây)","gp20":3640,"hc40":5264,"transit":"18–25 ngày"},{"route":"HCM → Houston, TX (Bờ Nam)","gp20":7000,"hc40":8176,"transit":"30–40 ngày"}]',
        1, 'draft');

INSERT INTO pricing_tables (slug, name, kind, description, schema_json, data_json, version, status)
VALUES ('chinhNgachAir', 'Chính ngạch Air — SGN → US', 'weight_grid', 'Xuất phát SGN (Tân Sơn Nhất) · cartons only · transit 7–8 ngày port-to-port cộng 3–4 ngày thủ tục hải quan US.',
        '{"type":"weight_grid","columns":[{"code":"destination","label":"Điểm đến","position":0,"type":"text"},{"code":"carrier","label":"Hãng bay","position":1,"type":"text"},{"code":"price_500kg","label":"500 kg (USD/kg)","position":2,"type":"number","semantic":"money_usd","currency":"USD"},{"code":"price_1000kg","label":"1.000 kg (USD/kg)","position":3,"type":"number","semantic":"money_usd","currency":"USD"},{"code":"cutoff","label":"Cut-off","position":4,"type":"text"},{"code":"routing","label":"Lộ trình","position":5,"type":"text"}]}',
        '[{"destination":"LAX (Los Angeles) — Bờ Tây","carrier":"ANA (NH)","price_500kg":6.05,"price_1000kg":5.99,"cutoff":"22:00, ETD−1","routing":"SGN → NRT → LAX"},{"destination":"LAX (Los Angeles) — Bờ Tây","carrier":"Korean Air (KE)","price_500kg":6.2,"price_1000kg":6.16,"cutoff":"22:00, ETD−2","routing":"SGN → ICN → LAX"},{"destination":"LAX (Los Angeles) — Bờ Tây","carrier":"EVA Air (BR)","price_500kg":8.75,"price_1000kg":8.62,"cutoff":"10:00 cùng ngày","routing":"SGN → TPE → LAX"},{"destination":"ORD (Chicago) — Bờ Đông","carrier":"ANA (NH)","price_500kg":7.6,"price_1000kg":7.5,"cutoff":"22:00, ETD−1","routing":"SGN → NRT → ORD"},{"destination":"ORD (Chicago) — Bờ Đông","carrier":"Qatar Airways (QR)","price_500kg":9.12,"price_1000kg":8.87,"cutoff":"20:00, ETD−1","routing":"SGN → DOH → ORD"},{"destination":"ORD (Chicago) — Bờ Đông","carrier":"EVA Air (BR)","price_500kg":9.49,"price_1000kg":9.36,"cutoff":"10:00 cùng ngày","routing":"SGN → TPE → ORD"},{"destination":"ORD (Chicago) — Bờ Đông","carrier":"Korean Air (KE)","price_500kg":9.61,"price_1000kg":9.61,"cutoff":"22:00, ETD−2","routing":"SGN → ICN → ORD"}]',
        1, 'draft');

INSERT INTO pricing_tables (slug, name, kind, description, schema_json, data_json, version, status)
VALUES ('chinhNgachCustoms', 'Chính ngạch — Khai báo hải quan xuất VN', 'weight_grid', 'Chi phí khai báo hải quan xuất tại VN, chưa gồm VAT 8%.',
        '{"type":"weight_grid","columns":[{"code":"lane","label":"Luồng","position":0,"type":"text"},{"code":"fee","label":"Phí (USD)","position":1,"type":"number","semantic":"money_usd","currency":"USD"},{"code":"note","label":"Ghi chú","position":2,"type":"text"}]}',
        '[{"lane":"Luồng Xanh","fee":62,"note":"+ VAT 8% · Hàng thông quan nhanh"},{"lane":"Luồng Vàng","fee":86,"note":"+ VAT 8% · Kiểm tra chứng từ"},{"lane":"Luồng Đỏ","fee":123,"note":"+ VAT 8% · Kiểm tra thực tế hàng"}]',
        1, 'draft');

INSERT INTO pricing_tables (slug, name, kind, description, schema_json, data_json, version, status)
VALUES ('chinhNgachMeta', 'Chính ngạch — Lịch tàu, kho CFS & khoản chưa bao gồm', 'meta_kv', 'Thông tin phi bảng giá đi kèm tuyến chính ngạch VN→US.',
        '{"type":"meta_kv","description":"Khóa → mô tả (lịch cut-off, kho CFS, khoản chưa bao gồm)"}',
        '{"matson_etd":"ETD thứ 5 hàng tuần · hàng sẵn tại NOVA CFS chiều ngày 18","matson_transit_port":"HCM / Hải Phòng → Long Beach, CA: 17–18 ngày","matson_transit_inland":"Long Beach → Door US: 6–8 ngày (rail/truck nội địa)","matson_transit_total":"HCM → Door US: 25–26 ngày","matson_cutoff":"T2 12:00 đặt booking · T2 16:00 nộp CDS · T3 12:00 nhận hàng tại CFS · T3 16:00 AMS & ISF · T5 ETD","cfs_haiphong":"CFS CTY Gemadept (03TGC16) — Lô CN3, KCN MP Đình Vũ, Q. Hải An, Hải Phòng","cfs_hochiminh":"ICD Transimex (02IKC09) — 429/8 Song Hành Hanoi Highway, P. Trường Thọ, TP Thủ Đức, HCMC","cfs_us":"NOVA CFS — 1710 E. Sepulveda Blvd, Carson, CA 90745 (khu Long Beach)","sea_thuong_cutoff":"FCL: ETD−2 ngày · LCL: ETD−3 ngày · tàu chạy 2–3 chuyến/tuần","excl_matson":"Chưa gồm: trucking nội địa VN, thủ tục hải quan, door-to-door tại Mỹ","excl_sea_lcl":"Chưa gồm: DDC ($31–34/wm), THC ($8/wm), CFS ($11/wm), LSS ($4.5/wm), AMS ($11/hbl), B/L ($22/hbl), hải quan VN & US, trucking, door delivery","excl_sea_fcl":"Chưa gồm: THC ($160–242/cont), B/L ($44/set), Seal ($11/cont), AMS ($44/set), hải quan VN & US, trucking, door delivery","excl_air":"Chưa gồm: Handling ($0.022/CW, min $22), AWB fee ($5.5/set), AMS ($11/MAWB cộng $11/HAWB), trucking ra sân bay, hải quan nhập Mỹ, door delivery","validity":"Giá FCL MATSON áp dụng Jul.1 – TBA · liên hệ THG để chốt giá theo ngày cụ thể"}',
        1, 'draft');
