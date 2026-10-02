# Phase 8: Web quản trị — báo cáo thực thi

Trạng thái: DONE_WITH_CONCERNS. Phần code, test, typecheck và lint đều xong. Riêng mục kiểm tra tay (in thẻ A6, quét thật bằng iPhone và Zalo) chưa làm được trong môi trường này.

## File đã làm (chỉ trong vùng sở hữu)
- `apps/web/src/features/admin-products/`: `api.ts`, `page.tsx`, `components/product-row.tsx`, `components/product-form.tsx`, `hooks/use-toggle-availability.ts`. Hai helper dùng chung cho mọi form quản trị cũng nằm ở đây: `form-field.tsx` (nhãn, ô nhập, lỗi) và `server-errors.ts` (đưa lỗi 422 `ApiError.fields` vào `setError`, có đổi tên field).
- `apps/web/src/features/admin-partners/`: `api.ts` (quán và QR), `open-hours.ts`, `format.ts`, `card-text.ts`, `card-image.ts` (vẽ PNG bằng canvas), `components/{partner-form, open-hours-editor, hidden-products-picker, table-list, qr-print-card, qr-download-button}.tsx`, `pages/{list, detail, print}.tsx`. `routes.ts` có thêm route `partners/:id/print`.
- `apps/web/src/features/admin-settings/`: `banks.ts` (35 ngân hàng, nguồn api.vietqr.io/v2/banks, cập nhật 01/10/2026), `components/{bank-picker, settings-form}.tsx`, `page.tsx`.
- `apps/web/src/features/admin-reports/`: `api.ts`, `period.ts`, `format.ts`, `components/{report-filters, commission-table, export-actions, adjustment-form, adjustment-list, funnel-table}.tsx`, `page.tsx`.
- `apps/web/src/mocks/admin-handlers.ts`: MSW cho toàn bộ endpoint quản trị. State nằm riêng trong file; món khởi tạo bằng cách chỉ đọc `db.products`; có `resetAdminMock()`.
- `apps/web/src/print.css`: thẻ A6, mỗi thẻ một trang.
- Test: `admin-partners/open-hours.test.ts`, `admin-partners/components/qr-print-card.test.tsx`, `admin-partners/components/partner-form.test.tsx`, `admin-reports/period.test.ts`, `admin-reports/components/commission-table.test.tsx`, `admin-products/page.test.tsx`.

## Kiểm tra (chạy trong `apps/web`)
- `pnpm exec vitest run src/features/admin-`: 6 file, 41 test, tất cả xanh, không có cảnh báo act hay console.
- `pnpm exec vitest run`: 16 file, 90 test xanh (gồm cả test của phần khác).
- `pnpm exec tsc -b`: sạch trên toàn dự án.
- `pnpm exec eslint src/features/admin-* src/mocks/admin-handlers.ts`: sạch.

## Lệch so với plan
- Không thêm shadcn `form`: form dùng `react-hook-form` và `zod` trực tiếp, kèm helper `FormField` của mình. Plan có nhắc sửa `shared/ui`, `mocks/handlers.ts` và `package.json`, nhưng không cần sửa file nào trong số đó.
- `@page { size: A6 }` được render bằng `<style>` ngay trong trang in thay vì đặt trong `print.css`. Lý do: CSS của chunk lười tải nằm lại trong document, nên nếu đặt ở `print.css` thì mọi lần in ở trang khác cũng thành khổ A6.
- Công tắc `accepting_orders` ở trang Cài đặt lưu ngay khi bấm (PUT một phần) chứ không đi theo nút "Lưu" của form, để khớp với công tắc trên header. Sau khi lưu đều gọi `setQueryData(settingsKey, ...)`.
- Hoa hồng nhập theo % (tối đa 2 chữ số thập phân) và gửi lên `commission_rate = round(%·100)/10000`. Lỗi 422 `commission_rate` được map vào ô %.
- Điều chỉnh: khi chọn "Tất cả quán" kèm "Kỳ hiện tại/Kỳ trước", API trả 422 nếu gửi `period` mà thiếu `partner_id`. Vì vậy danh sách điều chỉnh hiện 90 ngày gần nhất (mặc định của API) và có ghi chú trên giao diện.
- "Sao chép bản tóm tắt" khi chọn tất cả quán sẽ gọi export cho từng quán trong bảng rồi nối các bản text do server soạn. Nếu trình duyệt chặn clipboard (http, hoặc Safari mất cử chỉ người dùng sau khi chờ mạng), một hộp thoại textarea mở ra để chép tay.
- Có thêm kiểm tra khung giờ chồng nhau ở client, theo ý "validate trùng" trong plan. Server không chặn trường hợp này; hai khung nối tiếp nhau như 13:30/13:30 không bị tính là trùng.
- Bảng phễu có thêm dòng "cộng" theo quán.

## Còn mở
- Chưa kiểm tra tay: in A6 từ Safari/Chrome ra PDF, quét thẻ bằng camera iPhone và Zalo, và tải PNG trên Safari iOS. Phase 9 hoặc người bán cần làm.
- Chưa cập nhật trạng thái trong file phase vì file đó nằm ngoài vùng sở hữu; việc này để orchestrator làm qua `ak plan`.
- Test component dùng Radix Checkbox phải tự stub `ResizeObserver` trong file test, vì jsdom không có và tôi không được sửa `src/test/setup.ts`. Nếu muốn, có thể chuyển stub này vào setup chung.
