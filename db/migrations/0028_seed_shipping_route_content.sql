-- 0028: Restore shipping_routes body_md + shipping_route_tables from
-- the pre-S0S9-rebuild hardcoded route components (commit 7211a7b in
-- THG_landingpage). The S0–S9 rebuild deleted RouteVnRegular /
-- RouteVnCosmetics / RouteCnCosmetics / RouteCnBatteries / RouteVnPriority /
-- RouteCnPriority and switched landing to CMS fetch, but the content was
-- never seeded into D1 — so /shipping-policy on landing has been rendering
-- empty (title only) since the rebuild.
--
-- This migration:
--   1. UPDATEs shipping_routes.locale='vi' rows with markdown body_md +
--      notes_json (top-level danger callouts).
--   2. INSERTs shipping_route_tables rows for each PriceTable (PT) from the
--      original TSX. Tables hang off the VI source row's id so the public
--      reader's fallback chain (vi → en → zh) in getShippingTablesForSlug
--      surfaces them for all three locales.
--   3. cn-us-regular has no hardcoded source (added later as title-only via
--      CMS) and is intentionally skipped — operator can author it through
--      admin if/when needed.
--
-- VI is canonical here; EN/ZH content is left empty so the Sparkles AI
-- translate flow can generate review-gated drafts (avoiding the source-hash
-- drift problem the spec warns about when seeding multiple locales by hand).
--
-- Idempotency: the UPDATE only touches body_md + notes_json (won't overwrite
-- title or status). The INSERT uses NOT EXISTS to skip rows already seeded,
-- so re-running this migration after manual edits won't duplicate tables.

-- ════════════════════════════════════════════════════════════════════════
-- 1. vn-us-regular (Việt Nam → Toàn Cầu · Hàng Thường)
-- ════════════════════════════════════════════════════════════════════════

UPDATE shipping_routes SET body_md = '## % VAT / IOSS

- Từ 09:00 ngày 26/06/2021 — THG sẽ **KHÔNG thu VAT** nếu khách hàng cung cấp mã IOSS hợp lệ.
- Mọi vấn đề hải quan phát sinh do mã IOSS không hợp lệ (trả hàng hàng loạt, bị giữ, phạt...) do khách hàng tự chịu.
- Nếu không có IOSS và sử dụng dịch vụ ứng VAT của THG: phí = **thuế suất VAT nước đến + 2%** (phí dịch vụ THG).

🚨 **Lưu ý**: Kiện hàng có giá trị khai báo ≥ 150 EUR hoặc 155 USD sẽ KHÔNG được chấp nhận. Áp dụng cho các nước EU.

## ⚖ Trọng Lượng Tính Cước

Tính cước theo trọng lượng nào cao hơn — trọng lượng thực tế hoặc trọng lượng thể tích.

📌 Công thức trọng lượng thể tích: D × R × C (cm) ÷ 5000 = KG

## 🌍 Quốc Gia & Hạn Chế

- Không có bằng chứng giao hàng (POD) — liên hệ sales để thêm dịch vụ POD.
- Không giao đến các đảo phụ thuộc châu Âu.
- **🇺🇸 Mỹ**: Không bao gồm địa chỉ quân sự APO/FPO.
- **🇨🇭 Thụy Sĩ / 🇳🇴 Na Uy**: Phủ sóng toàn bộ lãnh thổ.
- **🇨🇱 Chile**: Toàn bộ lãnh thổ trừ một số khu vực hạn chế.
- **🇸🇬 Singapore**: Một số khu vực không thể giao — tham khảo danh sách mã bưu chính.
- **🇯🇵 Nhật Bản**: Không nhận APO/FPO hoặc địa chỉ Amazon.
- **🇬🇧 Anh**: Lục địa + các đảo. KHÔNG nhận lãnh thổ hải ngoại.
- **🇦🇪 UAE / 🇸🇦 Saudi Arabia**: Không nhận PO BOX — yêu cầu địa chỉ chính xác và SĐT.

## 📦 Yêu Cầu Hàng Hóa

🚨 Hàng có thương hiệu KHÔNG được chấp nhận — bao gồm nhãn hiệu, logo hoạt hình/anime quốc tế, biểu tượng CLB thể thao.

⚠ **Quá khổ/hình dạng đặc biệt**: phụ phí HKD 208/vé.

## 📍 Địa Chỉ Giao Hàng

- Tất cả quốc gia: Không nhận địa chỉ kho Amazon và địa chỉ quân sự.
- **Ba Lan — Packstation**: Chỉ Warsaw, Wroclaw, Poznan, Krakow. Tối đa 60×35×40cm, 25kg.
- **Bồ Đào Nha / Hy Lạp**: Không nhận địa chỉ PO Box.
- **🇯🇵 Nhật Bản**: Không APO/FPO hoặc Amazon. Phụ phí vùng xa: +HKD 105/kiện (Okinawa, Hokkaido, đảo xa).
- **🇺🇸 Mỹ**: Phụ phí vùng xa theo bảng giá.
- **🇨🇭 Thụy Sĩ**: Không giao được: MyPost24, MyPOST, Pickpost, Poststrasse, Postfach, PO BOX.
- **🇳🇴 Na Uy**: Địa chỉ PO Box: không có ký xác nhận giao hàng.
- **SE, DK, FI, LT, LV, EE**: Một số chặng cuối chỉ hỗ trợ tự lấy hàng.
- Phụ phí vùng xa: UK +44.400₫ | HR +219.600₫ | SE +360.000₫.

## ↩ Trả Hàng & Giao Lại

🚨 Tuyến này KHÔNG trả kiện hàng về Việt Nam từ nước ngoài.

⚠ Malta, Cyprus, Slovenia, Croatia, Romania, Bulgaria, Chile: Không hỗ trợ giao lại. Giao thất bại = bỏ hàng.

📌 Hết thời hạn mà không phản hồi → kiện hàng sẽ bị tiêu hủy mặc định.

## 🛡 Tiêu Chuẩn Bồi Thường

**Quy định chính**:
- Bồi thường tối đa: **30 USD/kiện**.
- Phải hoàn tất điều tra trước khi bồi thường.
- Hồ sơ cần thiết: (A) ảnh chụp hoàn tiền trên sàn, hoặc (B) bằng chứng đơn gửi lại + ảnh giao dịch.

**Không bồi thường**:
- Lỗi của người bán: hư hỏng, giao sai, chất lượng kém, đơn trùng, đóng gói không đạt.
- Giao thất bại do sai địa chỉ, từ chối nhận, vắng nhà, không đến lấy.
- Hư hỏng trong quá trình vận chuyển (từ kho đến nơi giao).
- Chậm trễ — THG không cam kết thời gian giao hàng.
- Hải quan tịch thu do vi phạm bản quyền, hàng cấm, hoặc khai báo thiếu.
- Bất khả kháng (chiến tranh, thiên tai, đại dịch, hành động chính phủ...).
- Hàng dễ vỡ (gốm, thủy tinh, nhựa đặc biệt) — gửi tự chịu rủi ro.

⚠ Nếu THG bị phạt do vi phạm của người bán: khách hàng chịu HKD 1.160/kiện cộng mọi tổn thất phát sinh.

## 📋 Yêu Cầu Khác

- Cung cấp link bán hàng và mã HS hải quan để hỗ trợ thông quan.
- Tên sản phẩm phải cụ thể — không dùng tên danh mục chung.
- Nhiều kiện gửi cùng người nhận cùng ngày: giá trị khai báo lũy kế không được vượt giới hạn quốc gia.
- Tên người nhận không được chứa các từ công ty (GmbH, kft, SRL, Ltd).
- **Saudi Arabia**: Tối đa 2 kiện/ngày mỗi người nhận; tối đa 3 SKU/kiện.
- Hàng dễ vỡ: phải thêm vật liệu chống sốc, bọt khí, và nhãn dễ vỡ trước khi gửi.

**Tra cứu vận đơn**: yuntrack.com · 17track.net · aftership.com/couriers/yunexpress'
WHERE slug = 'vn-us-regular' AND locale = 'vi';

INSERT INTO shipping_route_tables (route_id, position, caption, columns_json, rows_json)
SELECT id, 0, 'Giá Trị Khai Báo',
  '[{"key":"c0","label":"Quốc gia / Khu vực"},{"key":"c1","label":"Giới hạn"},{"key":"c2","label":"Ghi chú"}]',
  '[{"c0":"🇬🇧 Anh","c1":"Tối đa £135 / $155 / €150","c2":"Nền tảng/người bán phải khai báo theo giá bán thực tế."},{"c0":"🇺🇸 Mỹ","c1":"Tối đa $250/kiện","c2":"—"},{"c0":"🇪🇺 EU","c1":"Tối đa €150 / $155","c2":"—"},{"c0":"🇨🇭 Thụy Sĩ","c1":"Tối đa 62 CHF/ngày (~$66)","c2":"VAT 8.1% nếu lũy kế ≥ 62 CHF."},{"c0":"🇳🇴 Na Uy","c1":"Tối đa 3000 NOK (~€250)","c2":"Yêu cầu số VOEC từ 01/01/2024."},{"c0":"🇨🇦 Canada","c1":"Tối đa $99 USD","c2":"DDP. Miễn thuế dưới CAD 20. Thuế suất: 18%."},{"c0":"🇲🇽 Mexico","c1":"Tối đa $300 USD","c2":"Yêu cầu mã số thuế người nhận. Thuế 19% từ 01/01/2025."},{"c0":"🇸🇬 Singapore","c1":"Tối đa $290 USD","c2":"GST 9% + phí giấy phép nếu vượt."},{"c0":"🇦🇺 Úc","c1":"Tối đa $600 USD","c2":"Cùng tên+địa chỉ: lũy kế tối đa $600/ngày."},{"c0":"🇯🇵 Nhật Bản","c1":"Tối đa $110 USD (¥16,666)","c2":"Tối đa 10 món/kiện. Chỉ sử dụng cá nhân."},{"c0":"🇳🇿 New Zealand","c1":"Tối đa $550 USD","c2":"Yêu cầu tên sản phẩm chính xác."},{"c0":"🇦🇪 UAE","c1":"Tối đa $270 USD","c2":"—"},{"c0":"🇸🇦 Saudi Arabia","c1":"Tối đa $260 USD","c2":"Tối thiểu $5. VAT 15%. Phí xử lý HKD 38/vé."},{"c0":"🇷🇴 Romania","c1":"—","c2":"Từ 01/01/2026: phí 25 Lei (~€5) mỗi kiện thương mại từ ngoài EU."},{"c0":"🇨🇱 Chile","c1":"Tối đa $500 USD","c2":"Từ 25/10/2025: VAT 19%. Yêu cầu mã số thuế người nhận."}]'
FROM shipping_routes WHERE slug = 'vn-us-regular' AND locale = 'vi'
  AND NOT EXISTS (SELECT 1 FROM shipping_route_tables t WHERE t.route_id = shipping_routes.id AND t.position = 0);

INSERT INTO shipping_route_tables (route_id, position, caption, columns_json, rows_json)
SELECT id, 1, 'Quy định pin theo quốc gia',
  '[{"key":"c0","label":"Quốc gia"},{"key":"c1","label":"Được nhận"},{"key":"c2","label":"Không được nhận"}]',
  '[{"c0":"🇬🇧 Anh","c1":"Pin tích hợp (≤100Wh)","c2":"Pin rời/pin nguyên chất, chất lỏng, bột, súng đạn"},{"c0":"🇺🇸 Mỹ","c1":"Pin tích hợp + pin kèm theo","c2":"Pin nguyên chất, thực phẩm, mỹ phẩm, sản phẩm FDA, laser, mũ bảo hiểm"},{"c0":"EU (DE, FR, ES, NL, BE, IT, PL, AT, SE, DK)","c1":"Pin tích hợp","c2":"Pin rời/dự phòng, sản phẩm pin độc lập, dạng gel/paste"},{"c0":"🇨🇦 Canada","c1":"Pin tích hợp","c2":"Pin rời/nguyên chất, kem mỹ phẩm, kem sơn"},{"c0":"🇲🇽 Mexico","c1":"Hàng thường, pin tích hợp","c2":"Hàng nhái, paste, pin nguyên chất, chất lỏng, bột, sản phẩm gỗ"},{"c0":"SG / CL / CO","c1":"Pin tích hợp + pin kèm theo","c2":"Pin nguyên chất, bột, chất lỏng"},{"c0":"🇯🇵 Nhật Bản","c1":"Pin tích hợp (≤100Wh)","c2":"Pin nguyên chất, da, len, hàng cũ, đồ chơi trẻ sơ sinh, sản phẩm chứa amiăng"},{"c0":"🇸🇦 Saudi / 🇦🇪 UAE","c1":"Chỉ pin tích hợp","c2":"Pin kèm theo, thiết bị công suất cao, từ tính, chất lỏng, bột"}]'
FROM shipping_routes WHERE slug = 'vn-us-regular' AND locale = 'vi'
  AND NOT EXISTS (SELECT 1 FROM shipping_route_tables t WHERE t.route_id = shipping_routes.id AND t.position = 1);

INSERT INTO shipping_route_tables (route_id, position, caption, columns_json, rows_json)
SELECT id, 2, 'Giới hạn cân nặng theo quốc gia',
  '[{"key":"c0","label":"Giới hạn"},{"key":"c1","label":"Quốc gia"}]',
  '[{"c0":"0–5 kg","c1":"NO, IT, CL, BZ, CH"},{"c0":"0–10 kg","c1":"AU, NZ, SG, CA, MX, BZ, JP, HK"},{"c0":"0–15 kg","c1":"UK, DE, FR, ES, NL, BE, SE, PO, AT, DK, FI, IE, BG, CZ, EE, GR, HR, HU, LT, LV, PT, RO, SK, MT, SI, IL, LU, CY"},{"c0":"0–20 kg","c1":"UAE, SA"},{"c0":"0–30 kg","c1":"US"}]'
FROM shipping_routes WHERE slug = 'vn-us-regular' AND locale = 'vi'
  AND NOT EXISTS (SELECT 1 FROM shipping_route_tables t WHERE t.route_id = shipping_routes.id AND t.position = 2);

INSERT INTO shipping_route_tables (route_id, position, caption, columns_json, rows_json)
SELECT id, 3, 'Giới hạn kích thước',
  '[{"key":"c0","label":"Quốc gia"},{"key":"c1","label":"Kích thước tối đa"}]',
  '[{"c0":"🇺🇸 Mỹ","c1":"Tối thiểu 10×15cm; Tối đa 55×40×35cm"},{"c0":"🇨🇭 Thụy Sĩ","c1":"60×40×35cm"},{"c0":"🇸🇬 Singapore","c1":"Tối đa 60×40×35cm; D+R+C < 60cm; không cạnh nào > 150cm"},{"c0":"🇨🇱 Chile","c1":"D+R+C ≤ 200cm; cạnh dài nhất 60cm"},{"c0":"🇳🇿 New Zealand","c1":"60×50×40cm"},{"c0":"🇲🇽 Mexico","c1":"D+R+C ≤ 160cm; một cạnh < 60cm"},{"c0":"🇯🇵 Nhật / 🇦🇺 Úc","c1":"59×49×39cm"},{"c0":"🇳🇴 Na Uy","c1":"Cạnh dài nhất ≤ 45cm; D+R+C ≤ 90cm"},{"c0":"🇸🇦 Saudi / 🇦🇪 UAE","c1":"60×50×40cm; một cạnh ≤ 60cm"},{"c0":"🇨🇦 Canada","c1":"Cạnh dài nhất ≤ 100cm; cạnh thứ 2 ≤ 76cm; D+2(R+C) ≤ 250cm"},{"c0":"Khác","c1":"60×40×35cm"}]'
FROM shipping_routes WHERE slug = 'vn-us-regular' AND locale = 'vi'
  AND NOT EXISTS (SELECT 1 FROM shipping_route_tables t WHERE t.route_id = shipping_routes.id AND t.position = 3);

INSERT INTO shipping_route_tables (route_id, position, caption, columns_json, rows_json)
SELECT id, 4, 'Phí giao lại & thời hạn',
  '[{"key":"c0","label":"Quốc gia"},{"key":"c1","label":"Thời hạn"},{"key":"c2","label":"Phí"}]',
  '[{"c0":"🇨🇦 Canada","c1":"20 ngày","c2":"355.697₫ (kg đầu) + 56.342₫/kg sau"},{"c0":"🇲🇽 Mexico","c1":"15 ngày","c2":"108.252₫/kiện"},{"c0":"🇨🇭 Thụy Sĩ","c1":"—","c2":"216.820₫/kiện (1 lần duy nhất)"},{"c0":"🇫🇷 Pháp","c1":"—","c2":"216.820₫/kiện"},{"c0":"🇳🇴 Na Uy","c1":"14 ngày","c2":"216.820₫/kiện"},{"c0":"🇦🇺 Úc","c1":"14 ngày","c2":"216.820₫/kiện"},{"c0":"🇸🇦 Saudi Arabia","c1":"15 ngày","c2":"0–5kg: 268.729₫; >5kg: +32.286₫/kg"},{"c0":"🇦🇪 UAE","c1":"15 ngày","c2":"0–5kg: 126.610₫; >5kg: +32.286₫/kg"},{"c0":"🇯🇵 Nhật Bản","c1":"14 ngày","c2":"173.455₫/kiện"},{"c0":"🇬🇧 Anh","c1":"14 ngày","c2":"173.455₫/kiện"},{"c0":"SG / Brazil","c1":"14 ngày","c2":"260.183₫/kiện"},{"c0":"🇭🇰 Hong Kong","c1":"14 ngày","c2":"3 lần giao lại miễn phí (cùng địa chỉ)"},{"c0":"Quốc gia khác","c1":"14 ngày","c2":"237.394₫/kiện"}]'
FROM shipping_routes WHERE slug = 'vn-us-regular' AND locale = 'vi'
  AND NOT EXISTS (SELECT 1 FROM shipping_route_tables t WHERE t.route_id = shipping_routes.id AND t.position = 4);

INSERT INTO shipping_route_tables (route_id, position, caption, columns_json, rows_json)
SELECT id, 5, 'Thời hạn khiếu nại',
  '[{"key":"c0","label":"Giai đoạn"},{"key":"c1","label":"Thời hạn"}]',
  '[{"c0":"Chưa đến kho","c1":"30 ngày từ ngày lấy hàng"},{"c0":"Tại kho","c1":"60 ngày từ ngày nhập kho"},{"c0":"Đã xuất kho","c1":"60 ngày từ ngày nhập kho"}]'
FROM shipping_routes WHERE slug = 'vn-us-regular' AND locale = 'vi'
  AND NOT EXISTS (SELECT 1 FROM shipping_route_tables t WHERE t.route_id = shipping_routes.id AND t.position = 5);

-- ════════════════════════════════════════════════════════════════════════
-- 2. vn-us-cosmetics (Việt Nam → Toàn Cầu · Mỹ Phẩm)
-- ════════════════════════════════════════════════════════════════════════

UPDATE shipping_routes SET body_md = '## % VAT / IOSS

- Không thu VAT nếu cung cấp mã IOSS hợp lệ (từ 26/06/2021).
- Các vấn đề do IOSS không hợp lệ (trả hàng, bị giữ, phạt): khách hàng tự chịu.
- Không có IOSS + sử dụng dịch vụ ứng VAT của THG: phí = thuế suất VAT nước đến + 2%.

🚨 Kiện hàng ≥ 150 EUR hoặc 155 USD KHÔNG được chấp nhận.

## ⚖ Trọng Lượng Tính Cước

Tính theo trọng lượng nào cao hơn — thực tế hoặc thể tích. Thể tích: D × R × C (cm) ÷ 5000 = KG.

📌 Mỹ: trọng lượng tính cước tối thiểu 100g.

## 💄 Yêu Cầu Hàng Hóa

⚠ Chỉ nhận mỹ phẩm dạng lỏng, bột và kem — cộng bột nhuộm, bột sơn, nước súc miệng, mực. Chất lỏng chứa cồn NGHIÊM CẤM.

**Mỹ phẩm dạng lỏng được nhận**: Sơn gel móng tay · Tinh dầu · Nước hoa hồng (không cồn) · Lotion · Mặt nạ · Mặt nạ mắt · Kẻ mắt dạng lỏng · Serum lót trang điểm · Tẩy trang (không cồn)

**Mỹ phẩm dạng kem được nhận**: Sữa rửa mặt · Kem chống nắng (dạng lotion) · Mascara · Kem mặt/mắt · Kem che khuyết điểm · Gel lô hội · BB cream / Kem nền · Dầu gội / Sữa tắm · Dầu xả / Lotion dưỡng thể · Mặt nạ tóc · Son bóng / Son kem

**Mỹ phẩm dạng khô/bột được nhận**: Son môi / Son dưỡng · Chì kẻ mắt · Chì/bột kẻ lông mày · Phấn mắt · Phấn phủ bột/nén · Phấn highlight · Phấn má hồng · Xà phòng

- Tổng chất lỏng không cồn mỗi kiện: **tối đa 500ml**. Chile: tối đa 100ml.
- Tất cả sản phẩm lỏng, kem, dễ vỡ phải đóng trong thùng carton có lót/đệm.
- Nghiêm cấm: sản phẩm chứa pin, pin nguyên chất, vũ khí, hàng vi phạm bản quyền.
- **🇮🇪 Ireland**: Mỹ phẩm thuộc quy định HPRA không được nhận.

## 📏 Giới Hạn Cân Nặng & Kích Thước

**Giới hạn kích thước**:
- Mặc định tất cả quốc gia: tối đa 60×50×40cm
- US, BE, IE, NL: tối đa 60×40×35cm

⚠ Kiện hàng hình dạng đặc biệt: phụ phí 636.000₫/kiện.

## 📍 Địa Chỉ Giao Hàng

- Tất cả quốc gia: Không nhận địa chỉ Amazon và địa chỉ quân sự.
- **🇺🇸 Mỹ**: Phụ phí vùng xa theo bảng giá.
- **🇸🇪 Thụy Điển**: Phụ phí vùng xa +360.000₫/kiện.
- **🇬🇧 Anh**: Phụ phí vùng xa +44.400₫/kiện. Không nhận quân sự, lãnh thổ hải ngoại.
- **🇨🇭 Thụy Sĩ**: Không giao: MyPost24, MyPOST, Pickpost, Poststrasse, Postfach, PO BOX.

## ↩ Trả Hàng & Giao Lại

🚨 Không trả hàng về Việt Nam từ nước ngoài.

📌 Kiện hàng không có phản hồi trong thời hạn sẽ bị tiêu hủy mặc định.

## 🛡 Tiêu Chuẩn Bồi Thường

- Bồi thường tối đa: **30 USD/kiện**. Yêu cầu điều tra.
- Không bồi thường: lỗi người bán, sai địa chỉ, từ chối nhận, hư hỏng vận chuyển, hải quan tịch thu, bất khả kháng, hàng dễ vỡ.

⚠ Vi phạm từ người bán: khách hàng chịu HKD 1.160/kiện + mọi tổn thất phát sinh.'
WHERE slug = 'vn-us-cosmetics' AND locale = 'vi';

INSERT INTO shipping_route_tables (route_id, position, caption, columns_json, rows_json)
SELECT id, 0, 'Giới hạn cân nặng',
  '[{"key":"c0","label":"Giới hạn cân nặng"},{"key":"c1","label":"Quốc gia"}]',
  '[{"c0":"0–15 kg","c1":"UK, FR, DE, IT, ES, NL, BE, IE, SE, AT"},{"c0":"0–10 kg","c1":"🇨🇭 Thụy Sĩ"},{"c0":"0–30 kg","c1":"🇺🇸 Mỹ (cân nặng tính cước tối thiểu 100g)"}]'
FROM shipping_routes WHERE slug = 'vn-us-cosmetics' AND locale = 'vi'
  AND NOT EXISTS (SELECT 1 FROM shipping_route_tables t WHERE t.route_id = shipping_routes.id AND t.position = 0);

INSERT INTO shipping_route_tables (route_id, position, caption, columns_json, rows_json)
SELECT id, 1, 'Phí giao lại',
  '[{"key":"c0","label":"Quốc gia"},{"key":"c1","label":"Thời hạn"},{"key":"c2","label":"Phí"}]',
  '[{"c0":"🇨🇭 Thụy Sĩ","c1":"—","c2":"216.820₫/kiện (1 lần duy nhất)"},{"c0":"🇫🇷 Pháp","c1":"—","c2":"216.820₫/kiện"},{"c0":"🇬🇧 Anh","c1":"14 ngày","c2":"173.455₫/kiện"}]'
FROM shipping_routes WHERE slug = 'vn-us-cosmetics' AND locale = 'vi'
  AND NOT EXISTS (SELECT 1 FROM shipping_route_tables t WHERE t.route_id = shipping_routes.id AND t.position = 1);

INSERT INTO shipping_route_tables (route_id, position, caption, columns_json, rows_json)
SELECT id, 2, 'Thời hạn khiếu nại',
  '[{"key":"c0","label":"Giai đoạn"},{"key":"c1","label":"Thời hạn"}]',
  '[{"c0":"Chưa đến kho","c1":"30 ngày từ ngày lấy hàng"},{"c0":"Tại/đã xuất kho","c1":"60 ngày từ ngày nhập kho"}]'
FROM shipping_routes WHERE slug = 'vn-us-cosmetics' AND locale = 'vi'
  AND NOT EXISTS (SELECT 1 FROM shipping_route_tables t WHERE t.route_id = shipping_routes.id AND t.position = 2);

-- ════════════════════════════════════════════════════════════════════════
-- 3. cn-us-cosmetics (Trung Quốc → Toàn Cầu · Mỹ Phẩm)
-- ════════════════════════════════════════════════════════════════════════

UPDATE shipping_routes SET body_md = '## % VAT / IOSS

- Không thu VAT nếu cung cấp mã IOSS hợp lệ (từ 26/06/2021).
- Không có IOSS + dịch vụ ứng của THG: phí = thuế suất VAT nước đến + 2%.

🚨 Kiện hàng ≥ 150 EUR / 155 USD KHÔNG được chấp nhận.

## 🌍 Quốc Gia & Hạn Chế

- Không giao đến các đảo phụ thuộc.
- **🇺🇸 Mỹ**: Bao gồm Alaska, Hawaii, Puerto Rico, Guam, APO/FPO. Phụ phí vùng xa: RMB 50/kiện.
- **🇵🇱 Ba Lan**: Packstation chỉ tại Warsaw, Wroclaw, Poznan, Krakow.
- **Hy Lạp / UAE / PT / IL**: Không nhận địa chỉ PO Box.
- **🇵🇹 Bồ Đào Nha**: Không giao Azores hoặc Madeira. Không nhận mã bưu chính bắt đầu bằng "9".
- **🇮🇱 Israel**: Gaza không phục vụ. Mặc định giao đến điểm lấy hàng.
- **🇦🇺 Úc**: Phục vụ theo vùng (zone) theo mã bưu chính.
- **🇯🇵 Nhật Bản**: Không nhận APO/FPO, Amazon, hoặc vùng xa.
- **🇸🇦 Saudi Arabia (từ 01/01/2026)**: Yêu cầu Địa chỉ Quốc gia (National Address).
- Tất cả quốc gia: Không nhận địa chỉ Amazon và địa chỉ quân sự.

## 💄 Yêu Cầu Hàng Hóa

⚠ Tất cả hàng gửi EU trong phạm vi CE phải có dấu CE.

Cùng danh sách mỹ phẩm được nhận như tuyến VN (lỏng, kem, bột — không chứa cồn). Tổng chất lỏng không cồn: tối đa 500ml (Chile: 100ml).

**Quy định sản phẩm theo quốc gia**:
- **🇦🇪 UAE**: Bột nhuộm, phấn mắt, phấn phủ bột rời, chai thủy lực kim loại KHÔNG được nhận.
- **Thái Lan**: Mỹ phẩm được nhận (chỉ hàng không gắn nhãn/không thương hiệu).
- **🇲🇽 Mexico**: Chất lỏng tối đa 100ml; paste tối đa 150g. Không bột, xịt, chất lỏng chứa cồn.
- **Nam Phi**: Không nhận bột rời. Chỉ nhận sản phẩm nén ép.
- **🇮🇪 Ireland**: Mỹ phẩm thuộc quy định HPRA không được nhận.

## 📏 Giới Hạn Cân Nặng & Kích Thước

⚠ Kiện hàng hình dạng bất thường: phụ phí $25/kiện.

## ↩ Trả Hàng & Giao Lại

🚨 Không trả hàng về Trung Quốc từ nước ngoài.

⚠ SI, HR, BG, RO, KW, QA, BH, CY, MT: Không hỗ trợ giao lại ở nước ngoài.

## 🛡 Tiêu Chuẩn Bồi Thường

📌 Khiếu nại phải được gửi trong vòng 60 ngày kể từ khi THG xuất hàng. Khiếu nại trễ không được chấp nhận.

- Mỹ, Anh, Đức, Pháp: Bồi thường tối đa $20/kiện.
- Không bồi thường: lỗi người bán, giao thất bại, hư hỏng vận chuyển, chậm trễ, hải quan tịch thu, bất khả kháng, hàng dễ vỡ.
- Vi phạm từ người bán: $150/kiện + mọi tổn thất phát sinh.'
WHERE slug = 'cn-us-cosmetics' AND locale = 'vi';

INSERT INTO shipping_route_tables (route_id, position, caption, columns_json, rows_json)
SELECT id, 0, 'Trọng Lượng Tính Cước',
  '[{"key":"c0","label":"Quốc gia"},{"key":"c1","label":"Công thức"},{"key":"c2","label":"Cân nặng tối thiểu"}]',
  '[{"c0":"UAE","c1":"So sánh thực tế vs thể tích (÷6000) — tính cao hơn; nếu thể tích < 2× thực tế → tính thực tế","c2":"100g"},{"c0":"🇳🇿 New Zealand","c1":"So sánh thực tế vs thể tích (÷6000)","c2":"—"},{"c0":"🇸🇬 Singapore / TH","c1":"So sánh thực tế vs thể tích (÷5000)","c2":"—"},{"c0":"🇯🇵 Nhật Bản","c1":"So sánh thực tế vs thể tích (÷6000)","c2":"100g"},{"c0":"🇨🇦 Canada","c1":"So sánh thực tế vs thể tích (÷6000); nếu thể tích < 2× thực tế → tính thực tế","c2":"100g"},{"c0":"🇨🇱 Chile","c1":"Tính cao hơn giữa thực tế vs thể tích (÷6000); >2kg làm tròn theo 0.5kg","c2":"100g"},{"c0":"Quốc gia khác","c1":"So sánh thực tế vs thể tích (÷6000)","c2":"US tối thiểu 100g"}]'
FROM shipping_routes WHERE slug = 'cn-us-cosmetics' AND locale = 'vi'
  AND NOT EXISTS (SELECT 1 FROM shipping_route_tables t WHERE t.route_id = shipping_routes.id AND t.position = 0);

INSERT INTO shipping_route_tables (route_id, position, caption, columns_json, rows_json)
SELECT id, 1, 'Giá Trị Khai Báo',
  '[{"key":"c0","label":"Quốc gia"},{"key":"c1","label":"Giới hạn"},{"key":"c2","label":"Ghi chú"}]',
  '[{"c0":"🇬🇧 Anh","c1":"Tối đa GBP 135 / $155 / €150","c2":"Khai báo theo giá bán thực tế."},{"c0":"🇺🇸 Mỹ","c1":"Tối đa $60/kiện","c2":"—"},{"c0":"🇪🇺 EU","c1":"Tối đa €150 / $155","c2":"—"},{"c0":"Nam Phi","c1":"Tối đa $30 USD","c2":"Yêu cầu CMND người nhận từ 06/09/2022."},{"c0":"🇨🇦 Canada","c1":"Tối đa $99 USD","c2":"DDP. Thuế 18% × giá trị khai báo trên CAD 20."},{"c0":"🇳🇴 Na Uy","c1":"Tối đa 3000 NOK (~€250)","c2":"Yêu cầu số VOEC."},{"c0":"🇦🇺 Úc","c1":"Tối đa $600 USD","c2":"Cùng tên+địa chỉ lũy kế tối đa $600/ngày."},{"c0":"🇲🇽 Mexico","c1":"Tối đa $300 USD","c2":"Bắt buộc mã số thuế người nhận. Thuế 33.5% từ 08/2025."},{"c0":"🇯🇵 Nhật Bản","c1":"Tối đa $60 USD (¥10.000)","c2":"Tối đa 10 món/kiện. Chỉ sử dụng cá nhân."},{"c0":"🇸🇬 Singapore","c1":"Tối đa SGD 400 (~$290)","c2":"GST 9% + phí giấy phép nếu vượt."},{"c0":"🇨🇭 Thụy Sĩ","c1":"Tối đa 62 CHF/ngày","c2":"VAT 8.1% nếu vượt."},{"c0":"🇦🇪 UAE","c1":"Tối đa $270 USD","c2":"DDP."},{"c0":"🇸🇦 Saudi Arabia","c1":"Tối đa $260 USD","c2":"VAT 15%. Tối thiểu $5."}]'
FROM shipping_routes WHERE slug = 'cn-us-cosmetics' AND locale = 'vi'
  AND NOT EXISTS (SELECT 1 FROM shipping_route_tables t WHERE t.route_id = shipping_routes.id AND t.position = 1);

INSERT INTO shipping_route_tables (route_id, position, caption, columns_json, rows_json)
SELECT id, 2, 'Giới hạn cân nặng',
  '[{"key":"c0","label":"Giới hạn cân nặng"},{"key":"c1","label":"Quốc gia"}]',
  '[{"c0":"0–2 kg","c1":"SE, LU, DK"},{"c0":"0–5 kg","c1":"Hầu hết quốc gia khác"},{"c0":"0–10 kg","c1":"ZA, CL"},{"c0":"0–20 kg","c1":"🇦🇺 Úc"},{"c0":"0–25 kg","c1":"Thái Lan"},{"c0":"0–30 kg","c1":"🇲🇽 Mexico, 🇺🇸 Mỹ, 🇨🇦 Canada"}]'
FROM shipping_routes WHERE slug = 'cn-us-cosmetics' AND locale = 'vi'
  AND NOT EXISTS (SELECT 1 FROM shipping_route_tables t WHERE t.route_id = shipping_routes.id AND t.position = 2);

INSERT INTO shipping_route_tables (route_id, position, caption, columns_json, rows_json)
SELECT id, 3, 'Phí giao lại',
  '[{"key":"c0","label":"Quốc gia"},{"key":"c1","label":"Thời hạn"},{"key":"c2","label":"Phí"}]',
  '[{"c0":"🇨🇦 Canada","c1":"20 ngày","c2":"$14 (kg đầu) + $2.5/kg"},{"c0":"🇳🇴 Na Uy","c1":"14 ngày","c2":"$14.5/kiện"},{"c0":"🇦🇺 Úc","c1":"14 ngày","c2":"Theo cân nặng (≤1kg: $5.49; ≤5kg: $8.40; ≤20kg: $13.20)"},{"c0":"🇸🇦 Saudi Arabia","c1":"15 ngày","c2":"0–5kg: $10.5; >5kg: +$1.5/kg"},{"c0":"🇦🇪 UAE","c1":"15 ngày","c2":"0–5kg: $4.8; >5kg: +$1.5/kg"},{"c0":"🇲🇽 Mexico","c1":"5 ngày","c2":"$5/kiện"},{"c0":"🇯🇵 Nhật Bản","c1":"14 ngày","c2":"$7/kiện"},{"c0":"🇬🇧 Anh","c1":"14 ngày","c2":"$7/kiện"},{"c0":"Quốc gia khác","c1":"14 ngày","c2":"$8/kiện"}]'
FROM shipping_routes WHERE slug = 'cn-us-cosmetics' AND locale = 'vi'
  AND NOT EXISTS (SELECT 1 FROM shipping_route_tables t WHERE t.route_id = shipping_routes.id AND t.position = 3);

-- ════════════════════════════════════════════════════════════════════════
-- 4. cn-us-batteries (Trung Quốc → Toàn Cầu · Pin Điện)
-- ════════════════════════════════════════════════════════════════════════

UPDATE shipping_routes SET body_md = '## % VAT / IOSS

- Không thu VAT nếu cung cấp mã IOSS hợp lệ (từ 26/06/2021).
- Không có IOSS + dịch vụ ứng của THG: phí = thuế suất VAT nước đến + 2%.

🚨 Kiện hàng ≥ 150 EUR / 155 USD KHÔNG được chấp nhận.

## 🌍 Quốc Gia & Hạn Chế

- Không giao đến các đảo phụ thuộc.
- **🇺🇸 Mỹ**: Chỉ lục địa — không bao gồm Alaska, Hawaii, Puerto Rico, Guam, APO/FPO.
- **🇯🇵 Nhật Bản**: Không nhận APO/FPO, Amazon, hoặc vùng xa.
- **🇮🇱 Israel**: Chỉ tự lấy hàng (tối đa 5kg, 45×40×40cm). Không phục vụ Gaza.
- **🇬🇧 Anh**: Lục địa + đảo nội địa.
- **🇸🇦 Saudi Arabia (từ 01/01/2026)**: Yêu cầu Địa chỉ Quốc gia.
- IL, UAE, SA, JO, LB, KW, BH, QA: Không nhận PO Box.
- Tất cả quốc gia: Không nhận địa chỉ Amazon và quân sự.

## 🔋 Yêu Cầu Hàng Hóa

⚠ Tất cả hàng gửi EU trong phạm vi CE phải có dấu CE.

🚨 Tất cả quốc gia: Nghiêm cấm hàng thương hiệu/vi phạm bản quyền. Nghiêm cấm pin nguyên chất, chất lỏng, bột, súng đạn.

## 📏 Giới Hạn Cân Nặng & Kích Thước

⚠ Kiện hàng quá khổ: phụ phí $25/kiện.

## ↩ Trả Hàng & Giao Lại

🚨 Không trả hàng về Trung Quốc từ nước ngoài.

⚠ SI, HR, BG, RO, KW, QA, BH, CY, MT: Không hỗ trợ giao lại ở nước ngoài.

## 🛡 Tiêu Chuẩn Bồi Thường

📌 Khiếu nại phải được gửi trong vòng 60 ngày kể từ khi THG xuất hàng.

- Mỹ, Anh, Đức, Pháp: Tối đa $20/kiện.
- Vi phạm từ người bán: $150/kiện + mọi tổn thất phát sinh.'
WHERE slug = 'cn-us-batteries' AND locale = 'vi';

INSERT INTO shipping_route_tables (route_id, position, caption, columns_json, rows_json)
SELECT id, 0, 'Trọng Lượng Tính Cước',
  '[{"key":"c0","label":"Nhóm quốc gia"},{"key":"c1","label":"Công thức"},{"key":"c2","label":"Tối thiểu"}]',
  '[{"c0":"UAE, NZ, CA","c1":"So sánh thực tế vs thể tích (÷6000); nếu thể tích <2× thực tế → tính thực tế","c2":"100g"},{"c0":"SG, MY, TH, VN","c1":"Tính cao hơn giữa thực tế vs thể tích (÷5000)","c2":"—"},{"c0":"🇯🇵 Nhật Bản","c1":"Tính cao hơn giữa thực tế vs thể tích (÷6000)","c2":"500g"},{"c0":"KW, QA, BH, JO, LB, PK, NG, ZA","c1":"Tính cao hơn giữa thực tế vs thể tích (÷6000)","c2":"100g"},{"c0":"Brazil, AR, SV, CR, EC","c1":"Tính cao hơn giữa thực tế vs thể tích (÷6000)","c2":"100g"},{"c0":"PH, Indonesia","c1":"Chỉ tính trọng lượng thực tế — không tính thể tích","c2":"—"},{"c0":"CO, CL","c1":"Tính cao hơn giữa thực tế vs thể tích (÷5000)","c2":"100g"},{"c0":"Quốc gia khác","c1":"Tính cao hơn giữa thực tế vs thể tích (÷6000)","c2":"US tối thiểu 100g"}]'
FROM shipping_routes WHERE slug = 'cn-us-batteries' AND locale = 'vi'
  AND NOT EXISTS (SELECT 1 FROM shipping_route_tables t WHERE t.route_id = shipping_routes.id AND t.position = 0);

INSERT INTO shipping_route_tables (route_id, position, caption, columns_json, rows_json)
SELECT id, 1, 'Quy định nhận pin theo quốc gia',
  '[{"key":"c0","label":"Quốc gia/Nhóm"},{"key":"c1","label":"Được nhận"},{"key":"c2","label":"KHÔNG được nhận"}]',
  '[{"c0":"UK, IE, SE, LV, PT, RO, SI, SK","c1":"Hàng thường + pin tích hợp","c2":"Pin nguyên chất, pin rời/kèm theo"},{"c0":"Các nước EU khác","c1":"Hàng thường + pin tích hợp + pin kèm theo (≤100Wh)","c2":"Pin nguyên chất"},{"c0":"🇺🇸 Mỹ","c1":"Pin tích hợp + pin kèm theo","c2":"Pin nguyên chất, thực phẩm, mỹ phẩm, FDA, người lớn, laser, mũ bảo hiểm"},{"c0":"Nam Phi","c1":"Pin tích hợp + pin kèm theo","c2":"Pin nguyên chất, kem, mỹ phẩm, chất lỏng/bột"},{"c0":"🇨🇦 Canada","c1":"Pin tích hợp","c2":"Pin kèm theo/nguyên chất, kem mỹ phẩm"},{"c0":"🇲🇽 Mexico","c1":"Hàng thường + pin tích hợp + kèm theo","c2":"Hàng nhái, paste, pin nguyên chất, chất lỏng, bột"},{"c0":"SG / MY / TH / VN / PH / CL / CO","c1":"Pin tích hợp + kèm theo","c2":"Pin nguyên chất, bột, lỏng; MY/PH/VN/TH: cấm điện thoại"},{"c0":"🇯🇵 Nhật Bản","c1":"Pin tích hợp + kèm theo (≤100Wh)","c2":"Pin nguyên chất, da, len, hàng cũ, đồ chơi trẻ sơ sinh"},{"c0":"KW / QA / BH / JO / LB / SA / UAE","c1":"Chỉ pin tích hợp","c2":"Pin kèm theo, thiết bị công suất cao, từ tính, lỏng, bột"},{"c0":"Peru","c1":"Pin tích hợp + kèm theo (≤100Wh)","c2":"Pin nguyên chất, thực phẩm chức năng, mỹ phẩm, điện thoại"},{"c0":"Brazil","c1":"Hàng thường + pin tích hợp (không lộ bên ngoài)","c2":"Hàng nhái, paste, pin nguyên chất, chất lỏng, bột"},{"c0":"Indonesia","c1":"Hàng thường","c2":"Động/thực vật, thực phẩm, dược phẩm, pin, flycam, laser, máy chơi game"}]'
FROM shipping_routes WHERE slug = 'cn-us-batteries' AND locale = 'vi'
  AND NOT EXISTS (SELECT 1 FROM shipping_route_tables t WHERE t.route_id = shipping_routes.id AND t.position = 1);

INSERT INTO shipping_route_tables (route_id, position, caption, columns_json, rows_json)
SELECT id, 2, 'Giới hạn cân nặng',
  '[{"key":"c0","label":"Giới hạn cân nặng"},{"key":"c1","label":"Quốc gia"}]',
  '[{"c0":"0–2 kg","c1":"IL, NO, CH, MA | TZ, RW, EG, AO, SN, MU, RE, MG, SC, ZM, AR, PK"},{"c0":"0–5 kg","c1":"IL, NO, CH, MA"},{"c0":"0–10 kg","c1":"PH, ZA, MX, UAE, SA, JP, LB, SV, CR, ID, CL"},{"c0":"0–20 kg","c1":"UK, NL, BE, LU, AU, IE, SE, CO, KR, PE, BR"},{"c0":"0–25 kg","c1":"TH, NZ"},{"c0":"0–30 kg","c1":"🇺🇸 Mỹ, hầu hết quốc gia khác"}]'
FROM shipping_routes WHERE slug = 'cn-us-batteries' AND locale = 'vi'
  AND NOT EXISTS (SELECT 1 FROM shipping_route_tables t WHERE t.route_id = shipping_routes.id AND t.position = 2);

INSERT INTO shipping_route_tables (route_id, position, caption, columns_json, rows_json)
SELECT id, 3, 'Phí giao lại',
  '[{"key":"c0","label":"Quốc gia"},{"key":"c1","label":"Thời hạn"},{"key":"c2","label":"Phí"}]',
  '[{"c0":"🇨🇦 Canada","c1":"20 ngày","c2":"$14 (kg đầu) + $2.5/kg"},{"c0":"🇳🇴 Na Uy","c1":"14 ngày","c2":"$14.5/kiện"},{"c0":"🇸🇦 Saudi Arabia","c1":"15 ngày","c2":"0–5kg: $10.5; >5kg: +$1.5/kg"},{"c0":"🇦🇪 UAE","c1":"15 ngày","c2":"0–5kg: $4.8; >5kg: +$1.5/kg"},{"c0":"🇲🇽 Mexico","c1":"5 ngày","c2":"$5/kiện"},{"c0":"🇯🇵 Nhật Bản","c1":"14 ngày","c2":"$7/kiện"},{"c0":"🇬🇧 Anh","c1":"14 ngày","c2":"$7/kiện"},{"c0":"Quốc gia khác","c1":"14 ngày","c2":"$8/kiện"}]'
FROM shipping_routes WHERE slug = 'cn-us-batteries' AND locale = 'vi'
  AND NOT EXISTS (SELECT 1 FROM shipping_route_tables t WHERE t.route_id = shipping_routes.id AND t.position = 3);

-- ════════════════════════════════════════════════════════════════════════
-- 5. vn-us-priority (Việt Nam → Mỹ & Đức · Priority)
-- ════════════════════════════════════════════════════════════════════════

UPDATE shipping_routes SET body_md = '## % VAT / IOSS

- Không thu VAT nếu cung cấp mã IOSS hợp lệ (từ 09:00 ngày 26/06/2021).
- Các vấn đề do IOSS không hợp lệ: khách hàng tự chịu.
- Không có IOSS + dịch vụ ứng VAT của THG: phí = thuế suất VAT nước đến + 2%.

🚨 🇩🇪 Đức: Kiện hàng ≥ 150 EUR hoặc 155 USD KHÔNG được chấp nhận.

## ⚖ Trọng Lượng Tính Cước

Tính theo trọng lượng nào cao hơn — thực tế hoặc thể tích.

📌 Công thức thể tích: D × R × C (cm) ÷ 5000 = KG

## 🌍 Quốc Gia & Hạn Chế

- Không có bằng chứng giao hàng (POD) — liên hệ sales để thêm dịch vụ POD.
- **🇺🇸 Mỹ**: Chỉ các tiểu bang lục địa. Không bao gồm Alaska, Hawaii, Puerto Rico, Guam, APO/FPO.
- **🇩🇪 Đức**: Toàn bộ lãnh thổ, trừ các đảo phụ thuộc.

**Quy tắc đặt hàng & Pre-alert**:
- Phải điền cân nặng thực tế của kiện hàng. Mã theo dõi USPS được cấp ngay khi đặt hàng.
- Đơn hàng Mỹ tự động hủy nếu không gửi hàng trong **25 ngày** kể từ khi khai báo.

## 📋 Đặt Hàng & Giao Hàng

- Nhãn vận chuyển chặng cuối được tạo ngay khi đặt hàng THG (kích thước nhãn: 10×15cm).
- **🇺🇸 Mỹ chặng cuối**: USPS — 5–9 ngày làm việc.
- **🇩🇪 Đức chặng cuối**: DHL — 7–9 ngày làm việc.

📌 Thời gian giao chưa bao gồm chậm trễ do: nợ phí, khách giữ hàng, quá khổ/quá nặng, sai địa chỉ...

## 📦 Yêu Cầu Hàng Hóa

- Nhận pin tích hợp và pin kèm theo (tối đa 100Wh). Không nhận pin nguyên chất, chất lỏng, bột, súng đạn.
- Nghiêm cấm hàng thương hiệu và vi phạm sở hữu trí tuệ.

🚨 KHÔNG nhận: thực phẩm, dao kiểm soát, chất lỏng, bột, mỹ phẩm, sản phẩm gỗ thô, hàng nguy hiểm, laser, mũ bảo hiểm.

⚠ 🇺🇸 Mỹ: Sản phẩm FDA, tất cả mỹ phẩm, sản phẩm người lớn KHÔNG được nhận.

## 📍 Địa Chỉ Giao Hàng

🚨 Không nhận địa chỉ kho Amazon.

## ↩ Trả Hàng & Giao Lại

🚨 Không có dịch vụ trả hàng từ nước ngoài về Việt Nam.

- **🇺🇸 Mỹ & 🇩🇪 Đức**: Giao lại trong vòng **14 ngày**.
- Phí giao lại: **237.394₫/đơn**.
- Không phản hồi trong 14 ngày → kiện hàng tự động bị tiêu hủy.

## 🛡 Tiêu Chuẩn Bồi Thường

- Bồi thường tối đa: **20 USD/kiện**.
- Không bồi thường: lỗi người bán, giao thất bại, hư hỏng vận chuyển, chậm trễ, hải quan tịch thu, bất khả kháng, hàng dễ vỡ.'
WHERE slug = 'vn-us-priority' AND locale = 'vi';

INSERT INTO shipping_route_tables (route_id, position, caption, columns_json, rows_json)
SELECT id, 0, 'Giá Trị Khai Báo',
  '[{"key":"c0","label":"Quốc gia"},{"key":"c1","label":"Giới hạn"}]',
  '[{"c0":"🇺🇸 Mỹ","c1":"Tối đa $250 USD/kiện"},{"c0":"🇩🇪 Đức","c1":"KHÔNG chấp nhận nếu ≥ €150 / $155 USD"}]'
FROM shipping_routes WHERE slug = 'vn-us-priority' AND locale = 'vi'
  AND NOT EXISTS (SELECT 1 FROM shipping_route_tables t WHERE t.route_id = shipping_routes.id AND t.position = 0);

INSERT INTO shipping_route_tables (route_id, position, caption, columns_json, rows_json)
SELECT id, 1, 'Giới Hạn Cân Nặng & Kích Thước',
  '[{"key":"c0","label":"Quốc gia"},{"key":"c1","label":"Cân nặng"},{"key":"c2","label":"Kích thước (chuẩn)"},{"key":"c3","label":"Ghi chú"}]',
  '[{"c0":"🇺🇸 Mỹ","c1":"0–10 kg","c2":"Tối thiểu 10×15cm; Tối đa 50×60×40cm","c3":"—"},{"c0":"🇩🇪 Đức","c1":"0–30 kg","c2":"Tối thiểu 10×15cm; Tối đa 50×60×40cm","c3":"Packstation: tối đa 60×30×30cm"}]'
FROM shipping_routes WHERE slug = 'vn-us-priority' AND locale = 'vi'
  AND NOT EXISTS (SELECT 1 FROM shipping_route_tables t WHERE t.route_id = shipping_routes.id AND t.position = 1);

INSERT INTO shipping_route_tables (route_id, position, caption, columns_json, rows_json)
SELECT id, 2, 'Thời hạn khiếu nại',
  '[{"key":"c0","label":"Giai đoạn"},{"key":"c1","label":"Thời hạn khiếu nại"}]',
  '[{"c0":"Chưa đến kho","c1":"30 ngày từ ngày lấy hàng"},{"c0":"Tại kho / Đã xuất kho","c1":"60 ngày từ ngày nhập kho"}]'
FROM shipping_routes WHERE slug = 'vn-us-priority' AND locale = 'vi'
  AND NOT EXISTS (SELECT 1 FROM shipping_route_tables t WHERE t.route_id = shipping_routes.id AND t.position = 2);

-- ════════════════════════════════════════════════════════════════════════
-- 6. cn-us-priority (Trung Quốc → Mỹ/Anh/Đức/Pháp/Tây Ban Nha · Priority)
-- ════════════════════════════════════════════════════════════════════════

UPDATE shipping_routes SET body_md = '## % VAT / IOSS

- Không thu VAT nếu cung cấp mã IOSS hợp lệ (từ 26/06/2021).
- Không có IOSS + dịch vụ ứng của THG: phí = thuế suất VAT nước đến + 2%.

🚨 Kiện hàng ≥ 150 EUR / 155 USD KHÔNG được chấp nhận. Áp dụng: Đức, Pháp, Tây Ban Nha, và các nước EU khác.

## ⚖ Trọng Lượng Tính Cước

Tính theo trọng lượng nào cao hơn — thực tế hoặc thể tích.

📌 Công thức thể tích: D × R × C (cm) ÷ 6000 = KG

## 📦 Yêu Cầu Hàng Hóa

⚠ Tất cả hàng gửi EU trong phạm vi CE phải có dấu CE.

- Nhận pin tích hợp và pin kèm theo (tối đa 100Wh). Không nhận pin nguyên chất, chất lỏng, bột, súng đạn.
- Nghiêm cấm hàng thương hiệu / vi phạm sở hữu trí tuệ.

🚨 KHÔNG nhận: thực phẩm, dao, chất lỏng, bột, mỹ phẩm, sản phẩm gỗ thô, hàng nguy hiểm, laser, mũ bảo hiểm.

⚠ 🇺🇸 Mỹ: Sản phẩm FDA, tất cả mỹ phẩm, sản phẩm người lớn KHÔNG được nhận.

## 📍 Địa Chỉ Giao Hàng

🚨 Không nhận địa chỉ kho Amazon tại tất cả quốc gia.

## ↩ Trả Hàng & Giao Lại

🚨 Không có dịch vụ trả hàng từ nước ngoài về Trung Quốc.

📌 Không phản hồi trong thời hạn → kiện hàng bị tiêu hủy mặc định.

## 🛡 Tiêu Chuẩn Bồi Thường

📌 Khiếu nại phải được gửi trong vòng 60 ngày kể từ khi THG xuất hàng.

- Mỹ, Anh, Đức, Pháp: Tối đa **$20/kiện**.
- Mất trong quá trình vận chuyển THG (chưa được quét): không cần hồ sơ.
- Đơn vị vận chuyển xác nhận mất: cần ảnh chụp hoàn tiền trên sàn hoặc bằng chứng đơn gửi lại.

**Không bồi thường**: Lỗi người bán, giao thất bại, hư hỏng vận chuyển, chậm trễ, hải quan tịch thu, vi phạm bản quyền, bất khả kháng, hàng dễ vỡ.

⚠ Vi phạm từ người bán: $150/kiện + mọi tổn thất phát sinh.

## 📋 Yêu Cầu Khác

- Cung cấp link sản phẩm và mã HS để thông quan thuận lợi.
- Nhiều kiện gửi cùng người nhận/địa chỉ cùng ngày: giá trị khai báo lũy kế không vượt giới hạn quốc gia.
- Tên người nhận KHÔNG được chứa GmbH, kft, SRL, Ltd.
- Người bán phải đăng ký mã VAT/GST hợp lệ theo yêu cầu pháp luật.

**Tra cứu vận đơn**: yuntrack.com · 17track.net · aftership.com/couriers/yunexpress'
WHERE slug = 'cn-us-priority' AND locale = 'vi';

INSERT INTO shipping_route_tables (route_id, position, caption, columns_json, rows_json)
SELECT id, 0, 'Quốc Gia & Phạm Vi Phục Vụ',
  '[{"key":"c0","label":"Quốc gia"},{"key":"c1","label":"Phạm vi phục vụ"},{"key":"c2","label":"Chặng cuối"},{"key":"c3","label":"Thời gian"}]',
  '[{"c0":"🇺🇸 Mỹ","c1":"Toàn bộ lục địa. Không Alaska, Hawaii, Puerto Rico, Guam, APO/FPO.","c2":"USPS","c3":"5–10 ngày LV"},{"c0":"🇬🇧 Anh","c1":"Không nhận vùng xa hoặc địa chỉ quân sự.","c2":"Evri","c3":"5–7 ngày LV"},{"c0":"🇩🇪 Đức","c1":"Toàn quốc, trừ các đảo xa bờ.","c2":"DHL","c3":"6–8 ngày LV"},{"c0":"🇫🇷 Pháp","c1":"~95% mã bưu chính.","c2":"Colisprive","c3":"5–10 ngày LV"},{"c0":"🇪🇸 Tây Ban Nha","c1":"Mã bưu chính 35, 38, 51, 52 (đảo hải ngoại) KHÔNG phục vụ.","c2":"CTT","c3":"5–10 ngày LV"}]'
FROM shipping_routes WHERE slug = 'cn-us-priority' AND locale = 'vi'
  AND NOT EXISTS (SELECT 1 FROM shipping_route_tables t WHERE t.route_id = shipping_routes.id AND t.position = 0);

INSERT INTO shipping_route_tables (route_id, position, caption, columns_json, rows_json)
SELECT id, 1, 'Giá Trị Khai Báo',
  '[{"key":"c0","label":"Quốc gia"},{"key":"c1","label":"Giới hạn"}]',
  '[{"c0":"🇺🇸 Mỹ","c1":"Tối đa $60 USD/kiện"},{"c0":"🇬🇧 Anh","c1":"KHÔNG chấp nhận nếu ≥ GBP 135 / $155 / €150"},{"c0":"🇩🇪 Đức / 🇫🇷 Pháp / 🇪🇸 Tây Ban Nha","c1":"KHÔNG chấp nhận nếu ≥ €150 / $155"}]'
FROM shipping_routes WHERE slug = 'cn-us-priority' AND locale = 'vi'
  AND NOT EXISTS (SELECT 1 FROM shipping_route_tables t WHERE t.route_id = shipping_routes.id AND t.position = 1);

INSERT INTO shipping_route_tables (route_id, position, caption, columns_json, rows_json)
SELECT id, 2, 'Giới Hạn Cân Nặng & Kích Thước',
  '[{"key":"c0","label":"Quốc gia"},{"key":"c1","label":"Cân nặng"},{"key":"c2","label":"Kích thước tối đa"},{"key":"c3","label":"Ghi chú"}]',
  '[{"c0":"🇺🇸 Mỹ","c1":"0–30 kg","c2":"55×40×35cm","c3":"Quá khổ tối đa 68×43×43cm (+$25.5)"},{"c0":"🇬🇧 Anh","c1":"0–5 kg","c2":"60×40×35cm","c3":"Kiện quá khổ KHÔNG nhận"},{"c0":"🇩🇪 Đức","c1":"0–10 kg","c2":"60×40×35cm","c3":"Packstation: tối đa 60×30×30cm"},{"c0":"🇫🇷 Pháp","c1":"0–5 kg","c2":"60×40×35cm","c3":"Kiện quá khổ KHÔNG nhận"},{"c0":"🇪🇸 Tây Ban Nha","c1":"0–5 kg","c2":"60×40×35cm","c3":"Kiện quá khổ KHÔNG nhận"}]'
FROM shipping_routes WHERE slug = 'cn-us-priority' AND locale = 'vi'
  AND NOT EXISTS (SELECT 1 FROM shipping_route_tables t WHERE t.route_id = shipping_routes.id AND t.position = 2);

INSERT INTO shipping_route_tables (route_id, position, caption, columns_json, rows_json)
SELECT id, 3, 'Phí giao lại',
  '[{"key":"c0","label":"Quốc gia"},{"key":"c1","label":"Thời hạn"},{"key":"c2","label":"Phí"}]',
  '[{"c0":"🇺🇸 Mỹ / 🇩🇪 Đức / 🇫🇷 Pháp / 🇪🇸 Tây Ban Nha","c1":"14 ngày","c2":"$10.5/kiện (Pháp qua Colissimo)"},{"c0":"🇬🇧 Anh","c1":"14 ngày","c2":"$8.5/kiện"}]'
FROM shipping_routes WHERE slug = 'cn-us-priority' AND locale = 'vi'
  AND NOT EXISTS (SELECT 1 FROM shipping_route_tables t WHERE t.route_id = shipping_routes.id AND t.position = 3);
