---
phase: 4
title: "Web: thẻ Zalo trong Cài đặt + SĐT không bắt buộc"
status: completed
priority: P1
effort: "5h"
dependencies: [2]
---

# Phase 4: Web — thẻ Zalo trong Cài đặt + SĐT không bắt buộc

## Goal
Người bán kết nối Zalo bằng QR ngay trong `/seller/settings`; khách đặt được khi bỏ trống SĐT.

## Files
- Create: `apps/web/src/shared/api/zalo.ts` — `getZaloStatus`, `startZaloLink(consentVersion)`, `getZaloLink(id)`, `unlinkZalo` qua `request<T>`; kiểu khớp DTO phase 2.
- Create: `apps/web/src/features/admin-settings/components/zalo-card.tsx` (+ `zalo-card.test.tsx`). Tham khảo `teka/apps/web/src/features/profile/**/zalo*` cho luồng trạng thái; dựng lại bằng `shared/ui` (Card, Button, Checkbox, AlertDialog, Badge) của sidecup.
- Modify: `apps/web/src/features/admin-settings/page.tsx` — thêm `<ZaloCard />` sau thẻ "Giao hàng và chuyển khoản".
- Modify: `apps/web/src/mocks/` — handler MSW cho 4 endpoint (dùng cho test và dev mock); `customer-handlers.ts:74` trả `customer_phone: body.phone || null`.
- Modify: `apps/web/src/features/customer-menu/components/cart-sheet.tsx` (~113-133) — rỗng là hợp lệ; khác rỗng thì phải `isVNMobile`. Nhãn "Số điện thoại (không bắt buộc)"; dòng phụ "Nhập để nhận tin trạng thái đơn qua Zalo. Bỏ trống thì không nhận tin." Payload gửi `phone` chỉ khi có. Nhãn input giữ chữ "Số điện thoại" để `getByLabel` trong e2e còn khớp.
- Modify: test `customer-menu/page.test.tsx` — thêm ca đặt khi bỏ trống; ca số sai vẫn khoá nút; localStorage `sc_phone` không ghi chuỗi rỗng đè số cũ trừ khi khách chủ động xoá (giữ hành vi hiện tại, chỉ thêm test).
- Modify: `apps/web/src/features/seller-orders/components/notifier-banner.tsx` (+ test) — khi có `data.message` thì hiện đúng câu đó (API gửi câu hoàn chỉnh khi phiên hết hạn) kèm link "Mở Cài đặt" tới `/seller/settings`; không có message thì giữ câu chung cũ. Sửa comment đầu file cho đúng nghĩa mới. Banner nằm trên màn đơn, nên người bán thấy ngay khi đang làm việc.
- `seller-orders/components/order-card.tsx:77` đã xử lý `customer_phone` null — chỉ thêm test hiển thị đơn không SĐT.

## Thẻ Zalo — trạng thái
| Dữ liệu | Hiển thị |
|---|---|
| `configured=false` | "Chưa cấu hình Zalo trên máy chủ" + gợi ý đặt `ZALO_CREDENTIAL_KEY`; không có nút |
| chưa liên kết | Mô tả ngắn + checkbox đồng ý (rủi ro: cách không chính thức, nên dùng tài khoản Zalo phụ; tin gửi tới khách có nhập SĐT) + nút "Kết nối Zalo" (khoá tới khi tick) |
| đang liên kết | Poll `GET link/:id` mỗi 1,5 giây (TanStack Query `refetchInterval`, dừng ở trạng thái cuối). `qr_ready` → ảnh QR `data:image/png;base64,…` + "Mở Zalo trên điện thoại phụ → Quét mã"; `scanned` → "Xác nhận đăng nhập trên điện thoại"; `expired`/`error` → thông báo + nút thử lại |
| `linked` | Badge "Đã kết nối" + tên Zalo + ngày; nút "Ngắt kết nối" qua AlertDialog |
| `expired` | Badge đỏ "Phiên hết hạn" + nút "Quét lại mã QR" |

`consent_version` là hằng trong `zalo-card.tsx` (vd `"2026-10-02"`); đổi văn bản đồng ý thì tăng hằng. Sau khi linked/unlink, invalidate query status và query `notifier` để banner cập nhật.

## Verification
- `cd apps/web && pnpm test` — zalo-card: 5 trạng thái, nút khoá tới khi tick, poll dừng ở trạng thái cuối, unlink gọi DELETE sau xác nhận; cart-sheet: rỗng đặt được, số sai bị chặn; notifier-banner: phiên hết hạn hiện câu từ API + link Cài đặt, `healthy=true` thì không hiện.
- `pnpm lint && pnpm build`; `pnpm size` — route khách vẫn ≤ 120 KB gzip (thẻ Zalo chỉ nằm trong route người bán).
- Thủ công: `make dev`, mở `/seller/settings`, đi hết luồng với tài khoản Zalo phụ.
