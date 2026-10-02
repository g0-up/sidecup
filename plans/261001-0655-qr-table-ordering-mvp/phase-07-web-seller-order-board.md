---
title: "Phase 7: Web màn người bán: đăng nhập, bảng đơn, chuông, VietQR"
status: todo
priority: P1
effort: 2d
dependencies: [5]
---

# Phase 7: Web màn người bán: đăng nhập, bảng đơn, chuông, VietQR

## Context Links

- [architecture.md §5 Hợp đồng API (Người bán, Nội bộ)](./architecture.md#5-hợp-đồng-api), [§6 Route web](./architecture.md#6-route-web), quyết định A1, A4, A5
- PRD: P0-5 (chuông, cảnh báo đỏ notifier), P0-6 (nút theo bước, chống ghi đè), P0-8 (VietQR), P0-11 (hiện SĐT), người bán #1–#4, #6

## Overview

Màn làm việc chính của người bán trên điện thoại/máy tính bảng để mở ở quầy: đăng nhập, bảng đơn đang mở theo cột trạng thái, chuông khi có đơn mới, nút chuyển trạng thái một chạm, VietQR khi thu chuyển khoản, công tắc "Tạm ngưng nhận đơn", cảnh báo notifier. Chunk `seller` không bị ràng buộc ngân sách như chunk khách; dùng shadcn thoải mái.

## Key Insights

- Realtime (A1): tải `GET /api/seller/orders?scope=open` một lần rồi mở `/ws/seller`; `order.created` → thêm card + chuông + highlight; `order.updated` → upsert theo `id`; `settings.updated` → cập nhật công tắc; `notifier.status` → banner. Khi reconnect gọi lại REST với `updated_after=<lastServerTime>` để resync; khi WS không nối được → fallback polling 15s (dùng chung `use-socket` của phase 6). Lần tải đầu không kêu chuông.
- Chuông: trình duyệt chặn autoplay cho tới khi người dùng tương tác → màn có nút "Bật âm báo" lưu trạng thái `localStorage`; dùng `AudioContext` với file ngắn (`/sounds/new-order.mp3`), lặp mỗi 10s khi còn đơn `sent` chưa xem. Tiêu đề tab nháy "(1) Đơn mới".
- Chuyển trạng thái gửi `expected_from` = trạng thái đang hiển thị; 409 → toast "Đơn đã đổi trạng thái" + refetch đơn đó (A5, P0-6).
- Bước `delivering` có ba nút: "Thu tiền mặt" (`paid`, cash), "Chuyển khoản" (mở VietQR modal, trong modal có "Đã nhận tiền" → `paid`, transfer), "Không gặp khách" (`failed`, xác nhận hai bước vì không quay lại được). Hiện SĐT khách dạng `tel:` link ngay cạnh (P0-11).
- Link từ tin Zalo mở `/seller/orders/:id`: trang chi tiết dùng chung component với card trong bảng; nếu chưa đăng nhập → `/seller/login?next=`.
- Trạng thái notifier: lấy `/api/seller/notifier/status` lúc mở và mỗi lần reconnect, sau đó nhận `notifier.status` qua WS; banner đỏ cố định trên cùng khi `!healthy` hoặc `failed_last_hour > 0`: "Zalo không gửi được tin — chỉ còn chuông báo trên màn này". Banner vàng khi chính WS của màn người bán đang ở chế độ fallback ("Kết nối chậm, đang tự thử lại").
- Công tắc "Tạm ngưng nhận đơn" nằm ngay header (PUT settings `accepting_orders`), có trạng thái rõ ràng (màu + chữ) vì ảnh hưởng mọi quán.

## Requirements

- [x] `/seller/login`: form mật khẩu, lỗi 401/429 hiển thị; sau login → `next` hoặc `/seller`.
- [x] Layout seller: header (tên app, công tắc tạm ngưng, nút âm báo, menu: Đơn / Món / Quán / Cài đặt / Báo cáo, đăng xuất), banner notifier.
- [x] `/seller`: ba cột (hoặc ba section dọc trên mobile) `Đã gửi` / `Đang pha` / `Đang mang ra`; card đơn: mã, quán, bàn, thời gian từ lúc đặt (đếm lên, theo `server_time`), món + tuỳ chọn + số ly, ghi chú, tổng, SĐT (`tel:`), nút theo bước đúng P0-6; đơn `sent` > 60s đổi màu viền (người bán biết khách đang chờ).
- [x] Tab "Đã đóng hôm nay" (`scope=closed`, tải khi mở tab, cập nhật qua `order.updated`): đơn `paid/rejected/cancelled/failed` với nhãn và lý do.
- [x] `/seller/orders/:id`: chi tiết + cùng bộ nút; dùng khi mở từ link Zalo.
- [x] VietQR modal: QR render từ `payload` (`qrcode.react`), số tiền, nội dung = mã đơn, tên tài khoản; nút "Đã nhận tiền"; lỗi `BANK_NOT_CONFIGURED` → link tới cài đặt.
- [ ] Chuông + nhấp nháy tiêu đề + nút bật âm; test tay trên Safari iOS (cần một chạm).
- [x] Guard route: `GET /api/seller/me` 401 → về login; cookie hết hạn giữa chừng → toast + login.
- [x] Test vitest: reducer nhận message WS (`order.created` → đơn mới + chuông, `order.updated` upsert, không kêu khi tải đầu), resync sau reconnect không kêu chuông trùng, map trạng thái → nút, xử lý 409 (refetch), `elapsed` theo `server_time`.

## Architecture

```text
features/seller-auth/      api.ts (login/logout/me), page.tsx, guard.tsx (RequireSeller)
features/seller-orders/
  api.ts                   listOrders(scope, updatedAfter), getOrder, transition, getVietQR
  store.ts                 reducer: upsert, detect new sent ids, lastServerTime, apply WS message
  hooks/useOpenOrders.ts   load REST + useSocket('/ws/seller') + resync on reconnect + fallback poll 15s
  hooks/useNewOrderAlert.ts chuông/title
  components/              OrderCard, OrderActions, VietQrDialog, NotifierBanner, PauseSwitch, SoundToggle, BoardColumns
  pages/board.tsx, pages/order-detail.tsx
app/routes/seller.tsx      lazy routes dưới RequireSeller + SellerLayout
app/seller-layout.tsx
```

## Related Code Files

Create:
- `apps/web/src/features/seller-auth/**`, `apps/web/src/features/seller-orders/**` như sơ đồ, kèm `*.test.ts(x)`
- `apps/web/src/app/routes/seller.tsx` (khai báo route của phase 7 và import mảng `adminRoutes` từ `features/admin-*/routes.ts`; phase 8 chỉ thêm file routes của mình, không sửa file này), `apps/web/src/app/seller-layout.tsx`
- `apps/web/public/sounds/new-order.mp3` (file ngắn, tự tạo hoặc nguồn CC0, ghi nguồn)
- `apps/web/src/shared/ui/*` (thêm `dialog`, `switch`, `toast/sonner`, `tabs`, `card`, `badge` qua shadcn CLI)

Modify:
- `apps/web/src/app/router.tsx`, `apps/web/src/mocks/handlers.ts` (thêm seller endpoints), `apps/web/package.json` (`qrcode.react`)

## Implementation Steps

1. Auth: api, trang login, `RequireSeller` guard, layout.
2. `store.ts` reducer + test phát hiện đơn mới.
3. Board: poll hook, cột, card, nút theo bước, xử lý 409.
4. Chuông/title/nút âm.
5. VietQR dialog + luồng chuyển khoản.
6. Closed tab, trang chi tiết, pause switch, notifier banner.
7. Kiểm tra tay trên điện thoại thật: âm báo, `tel:` link, màn để mở 2 giờ không treo (poll ổn định, memory không tăng).

## Todo

- [x] login + guard + layout
- [x] poll store + test
- [x] board 3 cột + actions + 409
- [x] chuông + title + sound toggle
- [x] VietQR dialog
- [x] closed tab + detail page
- [x] pause switch + notifier banner
- [ ] test tay trên điện thoại

## Success Criteria

- Tạo đơn từ trang khách → card xuất hiện và chuông kêu trong ≤ 2s qua WS (đo bằng timestamp log); chặn `/ws` → vẫn xuất hiện trong ≤ 15s qua fallback, banner vàng hiện.
- Tắt API 10s rồi bật lại → màn tự reconnect, resync, không mất đơn, không kêu chuông trùng.
- Hai tab cùng bấm "Nhận đơn": một thành công, tab kia thấy toast và card chuyển cột, không có đơn nào bị ghi đè.
- Thu chuyển khoản: QR quét bằng app ngân hàng thật hiện đúng số tiền và nội dung; bấm "Đã nhận tiền" → đơn `paid` với `payment_method=transfer`.
- Dừng notifier (hoặc không chạy) → banner đỏ xuất hiện trong ≤ 2 phút; bật lại → banner tắt.
- `pnpm test` xanh.

## Risk Assessment

- Audio bị iOS chặn kể cả sau một chạm nếu `AudioContext` tạo trước tương tác: tạo context trong handler click của "Bật âm báo".
- Màn để mở nhiều giờ: socket bị proxy/ISP cắt im lặng → server ping 30s + client phát hiện không có pong 60s → reconnect; kiểm tra tay 2 giờ liên tục.

## Security Considerations

- SĐT khách chỉ hiện sau đăng nhập; không đưa vào URL hay log client.
- Nút "Không gặp khách" và "Từ chối" cần xác nhận hai bước vì không có đường quay lại.

## Next Steps

Phase 8 làm phần quản trị trên cùng layout.
