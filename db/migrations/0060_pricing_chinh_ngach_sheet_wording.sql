-- Chính ngạch VN→US: align the rate-card copy with the source sheet's wording
-- (XKCN Hub v6.0, thg_xkcn_v14.html), which the landing page now renders as-is.
--
-- Text only: no figure changes. Each value is swapped as a whole "key":"value"
-- pair and only while the row still holds the exact old text (instr guard), so
-- a value an operator has since edited in the Rate Card Builder is left alone,
-- and re-running is a no-op.
--
-- What changes, by the sheet:
--   * transit / cut-off / CFS strings use the sheet's labels and descriptions
--     ("Thứ 2 12:00 — Đặt booking" pills come from "T2 12:00 đặt booking");
--   * exclusion notes read "Chưa bao gồm: …." with the sheet's full stop and
--     "door delivery tại Mỹ" where the sheet says so;
--   * validity is the sheet's sentence. NOTE: this drops "Giá FCL MATSON áp
--     dụng Jul.1 – TBA", which the sheet no longer carries;
--   * surcharge "(if applicable)" → "(nếu có)"; green-lane note
--     "Hàng thông quan nhanh" → "Thông quan nhanh".

UPDATE pricing_tables
SET data_json  = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(data_json,
                   '"matson_etd":"ETD thứ 5 hàng tuần · hàng sẵn tại NOVA CFS chiều ngày 18"',
                   '"matson_etd":"ETD thứ 5 hàng tuần · Hàng về NOVA CFS chiều ngày 18"'),
                   '"matson_transit_port":"HCM / Hải Phòng → Long Beach, CA: 17–18 ngày"',
                   '"matson_transit_port":"HCM / Hải Phòng → Long Beach: 17–18 ngày"'),
                   '"matson_transit_inland":"Long Beach → Door US: 6–8 ngày (rail/truck nội địa, đã gồm thời gian chờ)"',
                   '"matson_transit_inland":"Long Beach → Door (nội địa Mỹ): 6–8 ngày (Rail / Truck nội địa · Bao gồm thời gian chờ)"'),
                   '"matson_transit_total":"HCM → Door US: 25–26 ngày (sea + nội địa Mỹ)"',
                   '"matson_transit_total":"HCM → Door US (tổng): 25–26 ngày (Sea + vận chuyển nội địa Mỹ kết hợp)"'),
                   '"matson_cutoff":"T2 12:00 đặt booking · T2 16:00 nộp CDS · T3 12:00 nhận hàng tại CFS · T3 16:00 AMS & ISF · T5 ETD"',
                   '"matson_cutoff":"T2 12:00 đặt booking · T2 16:00 nộp CDS (Khai báo HQ) · T3 12:00 nhận hàng tại kho CFS · T3 16:00 AMS & ISF cutoff · T5 ETD (tàu khởi hành)"'),
                   '"cfs_us":"NOVA CFS — 1710 E. Sepulveda Blvd, Carson, CA 90745 (khu Long Beach)"',
                   '"cfs_us":"NOVA CFS — 1710 E. Sepulveda Blvd, Carson, CA 90745 (Long Beach area)"'),
                   '"sea_thuong_cutoff":"FCL: ETD−2 ngày · LCL: ETD−3 ngày · tàu chạy 2–3 chuyến/tuần"',
                   '"sea_thuong_cutoff":"FCL: ETD − 2 ngày · LCL: ETD − 3 ngày · Tàu chạy: 2–3 chuyến/tuần"'),
                   '"excl_matson_lcl":"Chưa gồm: trucking nội địa VN, thủ tục hải quan VN & US, door delivery tại Mỹ"',
                   '"excl_matson_lcl":"Chưa bao gồm: trucking nội địa VN, thủ tục hải quan VN & US, door delivery tại Mỹ."'),
                   '"excl_matson_fcl":"Chưa gồm: trucking nội địa VN, hải quan VN & US, ISF, door delivery tại Mỹ"',
                   '"excl_matson_fcl":"Chưa bao gồm: trucking nội địa VN, hải quan VN & US, ISF, door delivery tại Mỹ."'),
                   '"excl_sea_lcl":"Chưa gồm: DDC (~$31–34/wm), THC (~$8/wm), CFS (~$11/wm), LSS (~$4.5/wm), AMS (~$11/hbl), B/L (~$22/hbl), hải quan VN & US, trucking, door delivery"',
                   '"excl_sea_lcl":"Chưa bao gồm: DDC (~$31–34/wm), THC (~$8/wm), CFS (~$11/wm), LSS (~$4.5/wm), AMS (~$11/hbl), B/L (~$22/hbl), hải quan VN & US, trucking, door delivery."'),
                   '"excl_sea_fcl":"Chưa gồm: THC (~$160–242/cont), B/L (~$44/set), Seal (~$11/cont), AMS (~$44/set), hải quan VN & US, trucking, door delivery"',
                   '"excl_sea_fcl":"Chưa bao gồm: THC (~$160–242/cont), B/L (~$44/set), Seal (~$11/cont), AMS (~$44/set), hải quan VN & US, trucking, door delivery tại Mỹ."'),
                   '"excl_air":"Chưa gồm: Handling (~$0.022/CW, min ~$22/lô), AWB fee (~$5.5/set), AMS (~$11/MAWB cộng ~$11/HAWB), trucking ra sân bay, hải quan nhập Mỹ, door delivery"',
                   '"excl_air":"Chưa bao gồm: Handling (~$0.022/CW, min ~$22/lô), AWB fee (~$5.5/set), AMS (~$11/MAWB cộng ~$11/HAWB), trucking ra sân bay, hải quan nhập Mỹ, door delivery tại Mỹ"'),
                   '"validity":"Giá FCL MATSON áp dụng Jul.1 – TBA · CLX nhanh hơn MAX do lịch tàu khác nhau · liên hệ TH Group để chốt giá theo ngày cụ thể"',
                   '"validity":"CLX nhanh hơn MAX do lịch tàu khác nhau · Liên hệ TH Group để chốt giá theo ngày cụ thể."'),
    version    = version + 1,
    updated_at = unixepoch()
WHERE slug = 'chinhNgachMeta'
  AND (
    instr(data_json, '"matson_etd":"ETD thứ 5 hàng tuần · hàng sẵn tại NOVA CFS chiều ngày 18"') > 0
    OR instr(data_json, '"matson_transit_port":"HCM / Hải Phòng → Long Beach, CA: 17–18 ngày"') > 0
    OR instr(data_json, '"matson_transit_inland":"Long Beach → Door US: 6–8 ngày (rail/truck nội địa, đã gồm thời gian chờ)"') > 0
    OR instr(data_json, '"matson_transit_total":"HCM → Door US: 25–26 ngày (sea + nội địa Mỹ)"') > 0
    OR instr(data_json, '"matson_cutoff":"T2 12:00 đặt booking · T2 16:00 nộp CDS · T3 12:00 nhận hàng tại CFS · T3 16:00 AMS & ISF · T5 ETD"') > 0
    OR instr(data_json, '"cfs_us":"NOVA CFS — 1710 E. Sepulveda Blvd, Carson, CA 90745 (khu Long Beach)"') > 0
    OR instr(data_json, '"sea_thuong_cutoff":"FCL: ETD−2 ngày · LCL: ETD−3 ngày · tàu chạy 2–3 chuyến/tuần"') > 0
    OR instr(data_json, '"excl_matson_lcl":"Chưa gồm: trucking nội địa VN, thủ tục hải quan VN & US, door delivery tại Mỹ"') > 0
    OR instr(data_json, '"excl_matson_fcl":"Chưa gồm: trucking nội địa VN, hải quan VN & US, ISF, door delivery tại Mỹ"') > 0
    OR instr(data_json, '"excl_sea_lcl":"Chưa gồm: DDC (~$31–34/wm), THC (~$8/wm), CFS (~$11/wm), LSS (~$4.5/wm), AMS (~$11/hbl), B/L (~$22/hbl), hải quan VN & US, trucking, door delivery"') > 0
    OR instr(data_json, '"excl_sea_fcl":"Chưa gồm: THC (~$160–242/cont), B/L (~$44/set), Seal (~$11/cont), AMS (~$44/set), hải quan VN & US, trucking, door delivery"') > 0
    OR instr(data_json, '"excl_air":"Chưa gồm: Handling (~$0.022/CW, min ~$22/lô), AWB fee (~$5.5/set), AMS (~$11/MAWB cộng ~$11/HAWB), trucking ra sân bay, hải quan nhập Mỹ, door delivery"') > 0
    OR instr(data_json, '"validity":"Giá FCL MATSON áp dụng Jul.1 – TBA · CLX nhanh hơn MAX do lịch tàu khác nhau · liên hệ TH Group để chốt giá theo ngày cụ thể"') > 0
  );

UPDATE pricing_tables
SET data_json  = REPLACE(data_json,
                   '"fee":"ISF Filing Fee (if applicable)"',
                   '"fee":"ISF Filing Fee (nếu có)"'),
    version    = version + 1,
    updated_at = unixepoch()
WHERE slug = 'chinhNgachMatsonSurcharge'
  AND (
    instr(data_json, '"fee":"ISF Filing Fee (if applicable)"') > 0
  );

UPDATE pricing_tables
SET data_json  = REPLACE(data_json,
                   '"note":"+ VAT 8% · Hàng thông quan nhanh"',
                   '"note":"+ VAT 8% · Thông quan nhanh"'),
    version    = version + 1,
    updated_at = unixepoch()
WHERE slug = 'chinhNgachCustoms'
  AND (
    instr(data_json, '"note":"+ VAT 8% · Hàng thông quan nhanh"') > 0
  );
