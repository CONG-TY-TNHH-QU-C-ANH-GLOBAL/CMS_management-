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
| T2 | Migration seed 5 bảng | leaf | T1 | todo | |
| T3 | Action lưu 5 bảng | trunk | T1 | todo | |
| T4 | Upload workbook trong admin | trunk | T3 | todo | |
| T5 | Hook và snapshot landing | leaf | T2 | todo | |
| T6 | Bảng giá tier landing | trunk | T5 | todo | |
| T7 | Bảng 3PL Zone 9 | trunk | T5 | todo | |
| T8 | Kiểm toàn bộ và mở PR | trunk | T4, T6, T7 | todo | |

## Chờ user

- (không có)

## Việc tiếp theo

- T2: migration 0071 seed 5 bảng từ fixture.
