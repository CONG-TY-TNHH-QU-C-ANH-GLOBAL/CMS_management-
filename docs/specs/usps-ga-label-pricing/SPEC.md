# Spec: Bảng giá USPS Ground Advantage label — CMS + landing — V1

Trạng thái: đã duyệt
Cập nhật: 2026-11-18
Phạm vi code: CMS `db/migrations/0071_*.sql`, `src/features/pricing/**`, `src/routes/admin/sales/pricing/**`; landing `src/pages/label/**`, `src/pages/DomesticPricingPage.tsx`, `src/components/pricing/**`, `src/data/threePlPricing*.ts`, `src/hooks/useCmsContent.ts`, `src/lib/i18n/translations/{label,pricing}.ts`

## Mục tiêu

Đưa bảng giá USPS Ground Advantage label (5 tier theo sản lượng; mỗi tier 24 mức cân 4–320 oz × Zone 1–9, USD/label) vào CMS làm nguồn duy nhất. Admin upload một file .xlsx (5 sheet "Tier 1".."Tier 5") là cập nhật cả 5 bảng. Landing hiển thị bảng ở `/<lang>/thg-label#pricing` (mục nav "Bảng giá Label") y như file Excel, thay cho 5 thẻ "n%" hiện tại. Tier 1 đồng thời là bảng giá 3PL ở `/<lang>/domestic-pricing#rate-table` (thay số hard-code, thêm Zone 9).

## Output cuối

| ID | Điều kiện phải đúng | Cách kiểm |
|---|---|---|
| DONE1 | D1 có 5 bảng `uspsGaLabelT1`..`uspsGaLabelT5`, `weight_grid`, `live`, mỗi bảng 24 dòng, cột `oz`,`g`,`z1`..`z9` (z* là `money_usd`/`USD`), số khớp đúng file `Bang_gia_usps_ga_label.xlsx` | `bun run db:migrate:local` rồi `bun test src/features/pricing` (test so migration với fixture từ file) → pass |
| DONE2 | Upload file .xlsx đúng mẫu trong admin → xem trước thay đổi → publish cập nhật cả 5 bảng một lần, mỗi bảng tăng version + có snapshot; file sai mẫu (thiếu sheet, sai số dòng, ô không phải số) bị từ chối, không ghi gì | `bun test src/features/pricing` → pass; thử tay trên CMS local |
| DONE3 | Lưu/rollback/upload bảng giá gọi `bumpCmsRev()` → landing được rebuild | test action; kiểm cờ rebuild sau khi lưu |
| DONE4 | `/vi/thg-label#pricing` (cả en, zh) hiện bảng giá y như Excel: 5 tab Tier 1–5; mỗi tab có tiêu đề "Bảng giá USPS Ground Advantage – THG Fulfillment – Tier n", dòng "Áp dụng cho sản lượng … · Đơn vị: USD/label", bảng đủ 24 dòng với cột STT, Cân nặng không quá (ounce), Gram, Zone 1–9; số lấy từ CMS; không còn thẻ "1%".."5%" | `bun run test` + Playwright spec mới → pass; prerender HTML chứa `4.49` và `47.29` |
| DONE5 | `/vi/domestic-pricing#rate-table` và ThreePlEstimator dùng Tier 1 từ CMS, có Zone 9; export Excel có cột Zone 9 | `bun run test` (threePlPricing.test cập nhật) → pass; HTML prerender chứa `7.48` (4 oz Zone 9) |
| DONE6 | Không đổi: API public `/api/v1/pricing*` giữ nguyên shape; các bảng giá khác không đổi | `bun run check:openapi-drift`, `bun run check:cms-types` → pass |

## Phạm vi

Trong phạm vi:

- CMS: migration 0071 seed 5 bảng; parser workbook 5 sheet; action lưu cả 5 bảng; nút upload trong admin; pricing save/rollback gọi `bumpCmsRev()`.
- Landing: hook đọc 5 bảng; thay `TierLadder` (thẻ n%) ở `#pricing` bằng bảng tab tier y như Excel; bỏ câu "Exact discounts follow the volume tiers in Pricing" và copy nói "giảm % theo tier" trong `#pricing`; Tier 1 thay `THREE_PL_USPS_RATES` (Zone 1–9) trên domestic-pricing + estimator; i18n vi/en/zh.

Ngoài phạm vi (để sau):

- Máy tính tiết kiệm `#calc` vẫn tính theo % — đổi sang giá thật là việc riêng.
- Ngày hiệu lực — file để trống, chưa hiển thị.
- Bản dịch cột/ghi chú trong CMS (API pricing không có locale; nhãn landing lấy từ i18n).

## Ranh giới

- Luôn làm: số liệu chỉ lấy từ file .xlsx (không gõ tay); migration ghi SQL undo ở đầu file; test pass trước mỗi commit.
- Hỏi trước: đổi shape API public; đụng bảng giá khác; chạy migration production; deploy.
- Không bao giờ: dùng `type:"currency"` cho cột USD (thành VND số nguyên); sửa tay `cms-generated.d.ts`; merge PR thay user.

## Ràng buộc kỹ thuật

- Stack: CMS TanStack Start + Cloudflare Workers + D1, `xlsx` 0.18.5, `bun test`; landing Vite/React, TanStack Query, Vitest, Playwright.
- Lệnh CMS: `bun run typecheck`; `bun test`; `bun run build`; `bunx eslint src/features/pricing/ src/routes/admin/sales/pricing/`; `bun run check:openapi-drift`.
- Lệnh landing: `bunx tsc --noEmit -p tsconfig.app.json`; `bun run lint`; `bun run test`; `bun run test:e2e`; `bun run build` (prerender + validate-seo-output).
- Quy ước: không có AGENTS.md/CLAUDE.md; theo header 0042 (live + money_usd + undo SQL) và `docs/engineering/LANDING_FOUNDATION.md` (gọi CMS qua `cmsClient`/hook, `tr(en,vi,zh)`, không string cứng).
- Giao hàng: CMS nhánh `feat/usps-ga-label-pricing`, landing nhánh `feat/usps-ga-label-pricing`, cả hai từ `origin/main`; commit sau mỗi task QA pass; mở 2 PR, user merge tay. Thứ tự lên prod: CMS + migration 0071 trước, landing sau.

## Giả định

- [đã xác nhận] Tier 1 thay đúng bảng 3PL, thêm Zone 9 — nguồn: user 2026-11-18.
- [đã xác nhận] Upload 1 lần cho cả 5 tier — nguồn: user 2026-11-18.
- [đã xác nhận] Chưa hiển thị ngày hiệu lực — nguồn: user 2026-11-18.
- [đã xác nhận] `#pricing` hiển thị y như file Excel (tiêu đề, dòng sản lượng, cột, 24 dòng), bỏ 5 thẻ % — user: "phải giữ như y excel là dc" (2026-11-18).
- [đã xác nhận] Slug `uspsGaLabelT1`..`T5`; tên "USPS Ground Advantage Label — Tier n"; mô tả = dải sản lượng.
- [đã xác nhận] Nút "Nhận báo giá" giữ dưới bảng (1 nút, source `label-pricing`).
- [đã xác nhận] Nếu CMS lỗi lúc runtime: landing dùng bản snapshot Tier 1–5 trong code (đồng bộ với migration bằng test).

## Câu hỏi mở

- (không có)

## Quyết định

- 2026-11-18 — `#pricing` y như Excel, bỏ thẻ %; giữ nguyên máy tính `#calc`; Tier 1 dùng cho 3PL — thay bản trước ("giữ thẻ %") — user: "phải giữ như y excel là dc".
- 2026-11-18 — Dữ liệu ở CMS (5 bảng `weight_grid`), không bảng mới — CMS không có create path, theo mẫu 0042 — `0042_pricing_chinh_ngach_vn_us.sql:3-21`.
- 2026-11-18 — Pricing save phải gọi `bumpCmsRev()` — hiện chỉ ghi KV, không kích rebuild landing nên HTML prerender giữ số cũ — `pricing.actions.ts:56,77`, `mutations.ts:32-45`.
