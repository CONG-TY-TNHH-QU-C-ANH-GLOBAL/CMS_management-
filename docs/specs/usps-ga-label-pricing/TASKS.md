# Tasks: Bảng giá USPS Ground Advantage label — CMS + landing

Spec: docs/specs/usps-ga-label-pricing/SPEC.md

## T1 — Parser workbook 5 tier (CMS)

- Lane: leaf
- Phụ thuộc: -
- Phục vụ: DONE1, DONE2
- AC1: `parseUspsGaWorkbook(buf)` trả 5 tier, mỗi tier 24 dòng `{oz,g,z1..z9}`, `oz` là số (4 … 15.999 … 320).
- AC2: thiếu sheet, sai header, ≠24 dòng, mức cân lệch danh sách chuẩn, ô zone không phải số dương → lỗi có tên sheet + ô, không trả dữ liệu.
- Verify: `bun test src/features/pricing/uspsGaWorkbook.test.ts` → pass (fixture dựng từ file thật + các ca lỗi)
- File dự kiến: `src/features/pricing/uspsGaWorkbook.ts`, `.test.ts`, `__fixtures__/usps-ga-label.json`
- Consumer: T2, T3, T4
- Stub được phép: không

## T2 — Migration 0071 seed 5 bảng (CMS)

- Lane: leaf
- Phụ thuộc: T1
- Phục vụ: DONE1
- AC1: INSERT 5 bảng `uspsGaLabelT1..T5`, `live`, schema `oz`/`g` number + `z1..z9` `money_usd`/`USD`; header ghi lý do + SQL undo.
- AC2: test đọc file migration, so data từng ô với fixture T1 → khớp 100%.
- Verify: `bun run db:migrate:local` → ok; `bun test src/features/pricing` → pass
- File dự kiến: `db/migrations/0071_pricing_usps_ga_label.sql`, `src/features/pricing/migration0071.test.ts`
- Consumer: API public, landing T5–T7
- Stub được phép: không

## T3 — Action lưu 5 bảng + bumpCmsRev (CMS)

- Lane: trunk
- Phụ thuộc: T1
- Phục vụ: DONE2, DONE3
- AC1: `saveUspsGaWorkbookFn` (editor) kiểm version của cả 5 bảng trước, rồi ghi 5 UPDATE + 5 snapshot trong một `db.batch`; lệch version → 409, không ghi gì.
- AC2: save, rollback và upload đều gọi `bumpCmsRev()`.
- Verify: `bun test src/features/pricing` → pass; `bun run typecheck` → 0 lỗi
- File dự kiến: `src/features/pricing/pricing.service.ts`, `pricing.actions.ts`, test kèm
- Consumer: T4
- Stub được phép: không

## T4 — Nút upload workbook trong admin (CMS)

- Lane: trunk
- Phụ thuộc: T3
- Phục vụ: DONE2
- AC1: trang `/admin/sales/pricing` có nút "Tải bảng giá USPS GA (5 tier)" cho editor; chọn file → bảng xem trước số ô đổi theo tier → Publish gọi T3; lỗi parser hiện rõ.
- AC2: viewer không thấy nút.
- Verify: `bunx eslint src/features/pricing/ src/routes/admin/sales/pricing/` → 0 lỗi; `bun run build` → ok; thử tay local với file thật
- File dự kiến: `src/features/pricing/components/UspsGaWorkbookDialog.tsx`, `src/routes/admin/sales/pricing/index.tsx`
- Consumer: admin
- Stub được phép: không

## T5 — Hook + snapshot dữ liệu USPS GA (landing)

- Lane: leaf
- Phụ thuộc: T2
- Phục vụ: DONE4, DONE5
- AC1: `useUspsGaLabelRates()` đọc 5 slug qua `cmsClient`/hook có sẵn, validate zod, trả `{tier, rows}`; bảng không `live` hoặc lỗi → dùng snapshot.
- AC2: `src/data/uspsGaLabelRates.ts` là snapshot 5 tier; test khóa dòng đầu/cuối mỗi tier khớp file.
- Verify: `bun run test` → pass
- File dự kiến: `src/hooks/useCmsContent.ts`, `src/data/uspsGaLabelRates.ts`, `.test.ts`
- Consumer: T6, T7
- Stub được phép: không

## T6 — Bảng giá tier ở /thg-label#pricing (landing)

- Lane: trunk
- Phụ thuộc: T5
- Phục vụ: DONE4
- AC1: bỏ `TierLadder` (thẻ n%); `#pricing` có 5 tab Tier 1–5, mỗi tab y như sheet Excel: tiêu đề, dòng "Áp dụng cho sản lượng … · Đơn vị: USD/label" (không ngày hiệu lực), bảng đủ 24 dòng, cột STT / Cân nặng không quá (ounce) / Gram / Zone 1–9; nút "Nhận báo giá" dưới bảng.
- AC2: chuỗi mới đủ vi/en/zh; xoá câu "Exact discounts follow the volume tiers…" và copy % trong `#pricing`; key parity test pass; Playwright kiểm 5 tab và ô 4 oz Zone 1 / 320 oz Zone 9 mỗi tier.
- Verify: `bun run test` → pass; `bun run build` → validate-seo-output pass; Playwright `tests/label-pricing.spec.ts` → pass
- File dự kiến: `src/pages/label/THGLabelPage.tsx`, `src/components/pricing/UspsGaTierTable.tsx`, `src/lib/i18n/translations/label.ts`, `tests/label-pricing.spec.ts`
- Consumer: khách xem web
- Stub được phép: không

## T7 — Tier 1 làm bảng 3PL domestic, thêm Zone 9 (landing)

- Lane: trunk
- Phụ thuộc: T5
- Phục vụ: DONE5
- AC1: `#rate-table`, export Excel và `ThreePlEstimator` dùng Tier 1 (Zone 1–9); `THREE_PL_USPS_RATES` bị thay bằng snapshot Tier 1.
- AC2: `domestic.table_desc` thành "Zone 1–9" (vi/en/zh); `threePlPricing.test.ts` cập nhật (dòng dài 10, đầu/cuối = Tier 1).
- Verify: `bunx tsc --noEmit -p tsconfig.app.json` → 0 lỗi; `bun run test` → pass; `bun run build` → HTML `/vi/domestic-pricing` chứa `7.48`
- File dự kiến: `src/pages/DomesticPricingPage.tsx`, `src/components/pricing/ThreePlEstimator.tsx`, `src/data/threePlPricing.ts`, `.test.ts`, `src/lib/i18n/translations/pricing.ts`
- Consumer: khách xem web
- Stub được phép: không

## T8 — Kiểm toàn bộ + mở 2 PR

- Lane: trunk
- Phụ thuộc: T4, T6, T7
- Phục vụ: DONE6
- AC1: CI CMS (typecheck, test, build, worker smoke, openapi-drift, eslint pricing) và landing (lint, tsc, test, e2e, build, check:cms-types) đều xanh.
- AC2: 2 PR mô tả thứ tự lên prod (CMS + migration 0071 → landing) và SQL undo.
- Verify: `gh pr checks <n>` → tất cả pass
- File dự kiến: -
- Consumer: user (merge tay)
- Stub được phép: không
