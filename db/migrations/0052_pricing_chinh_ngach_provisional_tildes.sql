-- Chính ngạch VN→US: restore the "~" on figures quoted inside the exclusion
-- notes, so the whole page reads as provisional.
--
-- A SEPARATE migration rather than an edit to 0050. Wrangler records applied
-- migrations by FILENAME in d1_migrations, so 0050 will never run again on any
-- database that already has it — and production already does. Editing it would
-- have changed the file without changing the data, leaving the repo claiming
-- something about prod that is not true.
--
-- The source rate sheet marks every figure "~" and closes with "giá tạm tính".
-- 0050 restored that everywhere except inside excl_sea_lcl / excl_sea_fcl /
-- excl_air, where the amounts sit in prose. The landing page now prefixes its
-- own table cells the same way, so leaving these three bare would read as a
-- page that is part indicative, part fixed.
--
-- Text only: no key is added, removed or re-valued beyond the tilde.

UPDATE pricing_tables
SET data_json  = '{"matson_etd":"ETD thứ 5 hàng tuần · hàng sẵn tại NOVA CFS chiều ngày 18","matson_transit_port":"HCM / Hải Phòng → Long Beach, CA: 17–18 ngày","matson_transit_inland":"Long Beach → Door US: 6–8 ngày (rail/truck nội địa, đã gồm thời gian chờ)","matson_transit_total":"HCM → Door US: 25–26 ngày (sea + nội địa Mỹ)","matson_cutoff":"T2 12:00 đặt booking · T2 16:00 nộp CDS · T3 12:00 nhận hàng tại CFS · T3 16:00 AMS & ISF · T5 ETD","cfs_haiphong":"CFS CTY Gemadept (03TGC16) — Lô CN3, KCN MP Đình Vũ, Q. Hải An, Hải Phòng","cfs_hochiminh":"ICD Transimex (02IKC09) — 429/8 Song Hành Hanoi Highway, P. Trường Thọ, TP Thủ Đức, HCMC","cfs_us":"NOVA CFS — 1710 E. Sepulveda Blvd, Carson, CA 90745 (khu Long Beach)","sea_thuong_cutoff":"FCL: ETD−2 ngày · LCL: ETD−3 ngày · tàu chạy 2–3 chuyến/tuần","excl_matson":"","excl_matson_lcl":"Chưa gồm: trucking nội địa VN, thủ tục hải quan VN & US, door delivery tại Mỹ","excl_matson_fcl":"Chưa gồm: trucking nội địa VN, hải quan VN & US, ISF, door delivery tại Mỹ","excl_sea_lcl":"Chưa gồm: DDC (~$31–34/wm), THC (~$8/wm), CFS (~$11/wm), LSS (~$4.5/wm), AMS (~$11/hbl), B/L (~$22/hbl), hải quan VN & US, trucking, door delivery","excl_sea_fcl":"Chưa gồm: THC (~$160–242/cont), B/L (~$44/set), Seal (~$11/cont), AMS (~$44/set), hải quan VN & US, trucking, door delivery","excl_air":"Chưa gồm: Handling (~$0.022/CW, min ~$22/lô), AWB fee (~$5.5/set), AMS (~$11/MAWB cộng ~$11/HAWB), trucking ra sân bay, hải quan nhập Mỹ, door delivery","validity":"Giá FCL MATSON áp dụng Jul.1 – TBA · CLX nhanh hơn MAX do lịch tàu khác nhau · liên hệ THG để chốt giá theo ngày cụ thể"}',
    version    = version + 1,
    updated_at = unixepoch()
WHERE slug = 'chinhNgachMeta';
