---
title: "Phase 8: Web quản trị: món, quán, bàn/QR, cài đặt, báo cáo"
status: todo
priority: P1
effort: 1.75d
dependencies: [5]
---

# Phase 8: Web quản trị: món, quán, bàn/QR, cài đặt, báo cáo

## Context Links

- [architecture.md §5 Hợp đồng API (Người bán)](./architecture.md#5-hợp-đồng-api), [§6 Route web](./architecture.md#6-route-web), quyết định A7, A10
- PRD: P0-1 (tạo/tải/thu hồi mã), P0-9 (báo cáo, điều chỉnh, export), P0-10 (bật/tắt món, quản lý quán), G4 (phễu), người bán #5, #7, chủ quán #1, #3

## Overview

Các trang quản trị dưới `SellerLayout` (phase 7): món, quán (kèm giờ bán, hoa hồng, kỳ trả, món ẩn), bàn + mã QR + thẻ in, cài đặt (ETA, ngân hàng), báo cáo hoa hồng và phễu, điều chỉnh, export. Chạy song song với phase 7; chỉ dùng chung `SellerLayout` và `shared/*`.

## Key Insights

- Bật/tắt món là thao tác nóng giờ trưa → công tắc ngay trên danh sách, optimistic update, rollback khi lỗi; không cần vào trang sửa (người bán #5 "trong vài giây").
- Thẻ QR in: component `QrPrintCard` render `qrcode.react` (SVG, level M, 512px) + tên quán + số bàn + chân thẻ "Đồ uống do <tên người bán> pha — giao tới bàn, thanh toán khi nhận"; nút "Tải ảnh" vẽ card lên `<canvas>` rồi `toBlob` → PNG; nút "In tất cả bàn" mở route in với CSS `@media print` (mỗi thẻ một trang A6).
- Thu hồi mã có xác nhận hai bước và nhắc "mã đã in sẽ hiện 'Mã này không còn dùng'".
- Báo cáo: chọn quán (hoặc tất cả), chọn chế độ "Kỳ hiện tại / Kỳ trước / Ngày / Khoảng ngày"; bảng theo quán + dòng tổng; cột `Đơn thu tiền | Doanh thu | Không giao | Hoa hồng | Điều chỉnh | Phải trả`. Số tiền format `1.234.000đ`.
- Export: nút "Sao chép bản tóm tắt" (gọi endpoint export, `navigator.clipboard.writeText`) và "Tải .txt". Không có SĐT trong nội dung (server đảm bảo, client không thêm).
- Phễu G4: bảng theo quán theo ngày `Thiết bị mở trang | Đơn | Đã thu tiền | Tỷ lệ đặt` (= đơn/thiết bị); đủ cho quyết định cổng 3; không vẽ chart ở bản đầu.
- Điều chỉnh: form `quán, số tiền (±), lý do, (mã đơn tuỳ chọn)`; danh sách hiện riêng dưới báo cáo.

## Requirements

- [x] `/seller/products`: danh sách (sort), công tắc `available` optimistic, form tạo/sửa (tên, giá, ảnh URL, có ngọt, có đá, thứ tự).
- [x] `/seller/partners`: danh sách quán (tên, trạng thái, hoa hồng, kỳ, tóm tắt giờ bán); form tạo/sửa gồm `hidden_product_ids` (checkbox từ danh sách món) và **trình sửa giờ bán nhiều khung** (`OpenHoursEditor`: mỗi dòng = chọn thứ T2..CN + từ + đến; thêm/xoá dòng; nút nhanh "Mọi ngày 11:00–13:30"; validate trùng/thiếu ở client và hiển thị lỗi 422 từ server).
- [x] `/seller/partners/:id`: tab "Bàn & mã QR": danh sách bàn với token, link, trạng thái; thêm bàn; xem thẻ; tải PNG; thu hồi; nút in tất cả.
- [x] `/seller/settings`: `eta_minutes`, `bank_bin` (chọn từ danh sách ngân hàng phổ biến có BIN, kèm ô nhập tay), `bank_account`, `bank_account_name`; `accepting_orders` cũng hiện ở đây.
- [x] `/seller/reports`: tab Hoa hồng (bộ lọc, bảng, export, điều chỉnh) và tab Phễu.
- [x] Mọi form dùng `react-hook-form` + `zod` với thông báo tiếng Việt; lỗi 422 từ server map vào field.
- [x] Test vitest: format tiền, tạo khoảng ngày từ chế độ lọc, `QrPrintCard` render đúng URL/nhãn, optimistic toggle rollback khi lỗi, `open-hours` validate (ngày trống, giờ sai) và tóm tắt ("T2–CN 11:00–13:30").

## Architecture

```text
features/admin-products/   api.ts, components/ProductRow, ProductForm, page.tsx
features/admin-partners/   api.ts, components/PartnerForm, OpenHoursEditor, HiddenProductsPicker, TableList, QrPrintCard, PrintAllPage; pages/list.tsx, detail.tsx; open-hours.ts (type + validate + summary)
features/admin-settings/   api.ts, components/BankPicker, SettingsForm, page.tsx, banks.ts (BIN list)
features/admin-reports/    api.ts, components/ReportFilters, CommissionTable, FunnelTable, AdjustmentForm, AdjustmentList; page.tsx; period.ts
```

## Related Code Files

Create:
- `apps/web/src/features/admin-products/**`, `admin-partners/**`, `admin-settings/**`, `admin-reports/**` như sơ đồ, kèm `*.test.ts(x)`
- `apps/web/src/app/routes/seller.tsx` (thêm route quản trị; file do phase 7 tạo, phase 8 chỉ thêm dòng route — phối hợp thứ tự merge)
- `apps/web/src/shared/ui/*` (thêm `form`, `select`, `table`, `checkbox`, `label`, `textarea`, `alert-dialog` qua shadcn CLI)
- `apps/web/src/print.css` (A6, không header/footer)

Modify:
- `apps/web/src/mocks/handlers.ts` (admin endpoints), `package.json` (`react-hook-form`, `zod`, `@hookform/resolvers`)

## Implementation Steps

1. `admin-products` (đơn giản nhất, chuẩn hoá form pattern).
2. `admin-partners` list/form + hidden products.
3. Bàn & QR: list, add, `QrPrintCard`, tải PNG, in tất cả, thu hồi.
4. `admin-settings` + danh sách BIN.
5. `admin-reports`: filters, commission table, export, adjustments, funnel.
6. Kiểm tra tay: in thẻ A6 từ Safari/Chrome ra PDF, quét thẻ bằng camera iOS và Zalo mở đúng `/t/<token>`.

## Todo

- [x] products page + toggle optimistic
- [x] partners list/form + hidden products
- [x] tables & QR + print card + download + revoke
- [x] settings + bank picker
- [x] reports commission + export + adjustments
- [x] funnel tab
- [ ] test in thẻ và quét thật

## Success Criteria

- Tắt một món → menu khách phản ánh trong ≤ 10s (kết hợp phase 6).
- Tạo bàn mới → tải PNG có QR + tên quán + số bàn; quét bằng camera iPhone và Zalo đều mở đúng trang bàn; thu hồi → quét hiện "Mã này không còn dùng".
- Báo cáo kỳ hiện tại khớp với số liệu API (so sánh với `curl`); sao chép bản tóm tắt dán được vào Zalo, không có SĐT.
- Tạo điều chỉnh -20.000đ → cột "Phải trả" giảm đúng.
- `pnpm test` xanh.

## Risk Assessment

- Canvas `toBlob` với SVG QR trên Safari cần `Image` load từ data URI: dùng `qrcode.react` `QRCodeCanvas` thay vì SVG cho bước tải, SVG cho hiển thị.
- Danh sách BIN ngân hàng lỗi thời: cho nhập tay; ghi chú nguồn và ngày cập nhật trong `banks.ts`.
- Xung đột file `app/routes/seller.tsx` với phase 7: phase 7 tạo file và để sẵn mảng `adminRoutes` import từ `features/admin-*/routes.ts`, phase 8 chỉ thêm file routes của mình.

## Security Considerations

- Toàn bộ dưới `RequireSeller`.
- Export/bản sao chép lấy từ server, client không ghép thêm dữ liệu đơn.

## Next Steps

Phase 9 kiểm thử toàn luồng và viết docs.
