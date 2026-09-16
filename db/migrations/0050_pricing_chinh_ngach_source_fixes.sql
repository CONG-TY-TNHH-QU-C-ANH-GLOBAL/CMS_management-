-- Chính ngạch VN→US rate cards: reconcile against the source rate sheet (XKCN
-- Hub v6.0 / thg_xkcn_v14), tab "Bảng giá".
--
-- Every figure seeded by 0042 was re-diffed against that sheet and matches — no
-- price changes here. What 0042 lost was labelling and two lines of prose:
--
--   1. chinhNgachMatsonFcl column labels read D20 / D40 / D40H / D45H. The
--      source sheet and chinhNgachSeaFcl both use the ISO container codes
--      20GP / 40GP / 40HC / 45HC, which is what shippers quote against.
--      Data rows are untouched — only schema_json labels change.
--
--   2. excl_matson collapsed the sheet's TWO distinct exclusion notes into one
--      and dropped ISF. The sheet excludes ISF on FCL but not on LCL, because
--      on LCL the ISF Filing Fee is already a priced line in the accessorial
--      table (chinhNgachMatsonSurcharge, ~$34/HBL). Blending the two implied
--      ISF is never included. Split to mirror excl_sea_lcl / excl_sea_fcl.
--
--   3. validity omitted the sheet's "CLX nhanh hơn MAX do lịch tàu khác nhau",
--      which is the reason the FCL table carries two services at all.
--
-- The old excl_matson key is left in data_json but blanked rather than deleted:
-- CmsMetaList skips keys whose value is empty, so a landing build still running
-- the previous MATSON_META array degrades to "no note" instead of rendering a
-- stale one. Drop the key once that build is retired.

UPDATE pricing_tables
SET schema_json = '{"type":"weight_grid","columns":[{"code":"service","label":"Service","position":0,"type":"text"},{"code":"origin","label":"Tuyến","position":1,"type":"text"},{"code":"charge","label":"Khoản phí","position":2,"type":"text"},{"code":"d20","label":"20GP (USD)","position":3,"type":"number","semantic":"money_usd","currency":"USD"},{"code":"d40","label":"40GP (USD)","position":4,"type":"number","semantic":"money_usd","currency":"USD"},{"code":"d40h","label":"40HC (USD)","position":5,"type":"number","semantic":"money_usd","currency":"USD"},{"code":"d45h","label":"45HC (USD)","position":6,"type":"number","semantic":"money_usd","currency":"USD"},{"code":"transit","label":"Transit","position":7,"type":"text"}]}',
    version    = version + 1,
    updated_at = unixepoch()
WHERE slug = 'chinhNgachMatsonFcl';

UPDATE pricing_tables
SET data_json  = '{"matson_etd":"ETD thứ 5 hàng tuần · hàng sẵn tại NOVA CFS chiều ngày 18","matson_transit_port":"HCM / Hải Phòng → Long Beach, CA: 17–18 ngày","matson_transit_inland":"Long Beach → Door US: 6–8 ngày (rail/truck nội địa, đã gồm thời gian chờ)","matson_transit_total":"HCM → Door US: 25–26 ngày (sea + nội địa Mỹ)","matson_cutoff":"T2 12:00 đặt booking · T2 16:00 nộp CDS · T3 12:00 nhận hàng tại CFS · T3 16:00 AMS & ISF · T5 ETD","cfs_haiphong":"CFS CTY Gemadept (03TGC16) — Lô CN3, KCN MP Đình Vũ, Q. Hải An, Hải Phòng","cfs_hochiminh":"ICD Transimex (02IKC09) — 429/8 Song Hành Hanoi Highway, P. Trường Thọ, TP Thủ Đức, HCMC","cfs_us":"NOVA CFS — 1710 E. Sepulveda Blvd, Carson, CA 90745 (khu Long Beach)","sea_thuong_cutoff":"FCL: ETD−2 ngày · LCL: ETD−3 ngày · tàu chạy 2–3 chuyến/tuần","excl_matson":"","excl_matson_lcl":"Chưa gồm: trucking nội địa VN, thủ tục hải quan VN & US, door delivery tại Mỹ","excl_matson_fcl":"Chưa gồm: trucking nội địa VN, hải quan VN & US, ISF, door delivery tại Mỹ","excl_sea_lcl":"Chưa gồm: DDC ($31–34/wm), THC ($8/wm), CFS ($11/wm), LSS ($4.5/wm), AMS ($11/hbl), B/L ($22/hbl), hải quan VN & US, trucking, door delivery","excl_sea_fcl":"Chưa gồm: THC ($160–242/cont), B/L ($44/set), Seal ($11/cont), AMS ($44/set), hải quan VN & US, trucking, door delivery","excl_air":"Chưa gồm: Handling ($0.022/CW, min $22/lô), AWB fee ($5.5/set), AMS ($11/MAWB cộng $11/HAWB), trucking ra sân bay, hải quan nhập Mỹ, door delivery","validity":"Giá FCL MATSON áp dụng Jul.1 – TBA · CLX nhanh hơn MAX do lịch tàu khác nhau · liên hệ THG để chốt giá theo ngày cụ thể"}',
    version    = version + 1,
    updated_at = unixepoch()
WHERE slug = 'chinhNgachMeta';
