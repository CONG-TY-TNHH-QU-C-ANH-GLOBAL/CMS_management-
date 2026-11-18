# STATUS — Bảng giá USPS Ground Advantage label — CMS + landing

Spec: SPEC.md
Tasks: TASKS.md
Chế độ: tự chạy
Nghiệm thu: chưa
Giới hạn: không
Cập nhật: 2026-11-18T12:49+07:00

## Bảng task

| ID | Task | Lane | Phụ thuộc | Trạng thái | Bằng chứng |
|---|---|---|---|---|---|
| T1 | Parser workbook 5 tier | leaf | - | done | `bun test src/features/pricing` 184 pass; typecheck sạch; eslint 0 lỗi (endOfLine auto) |
| T2 | Migration seed 5 bảng | leaf | T1 | done | migration0071.test 4 pass; db:migrate:local ok; 5 bảng live, 24 dòng, T1 4 oz Z1 = 4.49, 320 oz Z9 = 47.29 |
| T3 | Action lưu 5 bảng | trunk | T1 | done | uspsGa.integration.test 4 pass (lưu đủ 5; lệch version 1 tier → không ghi gì; publish chen ngang → rollback cả batch; dữ liệu sai → 400); pricing 192 pass; typecheck sạch; save/rollback/upload gọi bumpCmsRev |
| T4 | Upload workbook trong admin | trunk | T3 | done | uspsGaDiff.test 2 pass; pricing 194 pass; eslint 0 lỗi; build ok; dist/ boot trong workerd: openapi 200, /pricing/uspsGaLabelT1 live 24 dòng 4.49/47.29. Chưa thử tay UI (Chrome mất kết nối) — user kiểm |
| T5 | Hook và snapshot landing | leaf | T2 | done | landing 402cc30; snapshot sinh từ xlsx qua parser CMS; uspsGaLabelRates.test 6 pass |
| T6 | Bảng giá tier landing | trunk | T5 | done | landing bc98cfc; UspsGaTierTable.test 2 pass; prerender vi/en/zh có 4.49, 47.29, 7.48, Zone 9, không còn thẻ %; CMS 990ab1d migration 0072 sửa override i18n (test 2 pass) |
| T7 | Bảng 3PL Zone 9 | trunk | T5 | done | landing dbd83b2; e2e label-pricing 3 pass; landing: tsc sạch, lint 0 lỗi (40 warning có sẵn ở main), unit 319 pass, e2e 25 pass, build + validate-seo ok |
| T8 | Kiểm toàn bộ và mở PR | trunk | T4, T6, T7 | doing | QA độc lập (qa-core) |

## Chờ user

- (không có)

## Việc tiếp theo

- T8: QA độc lập bằng qa-core; pass thì mở 2 PR (CMS trước, landing sau).
