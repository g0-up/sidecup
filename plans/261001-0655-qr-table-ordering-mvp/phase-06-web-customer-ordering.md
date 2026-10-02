---
title: "Phase 6: Web trang khách: menu, giỏ, trạng thái đơn"
status: todo
priority: P1
effort: 2d
dependencies: [4]
---

# Phase 6: Web trang khách: menu, giỏ, trạng thái đơn

## Context Links

- [architecture.md §5 Hợp đồng API (Khách)](./architecture.md#5-hợp-đồng-api), [§6 Route web](./architecture.md#6-route-web), quyết định A1, A2, A6, A12
- PRD: P0-2, P0-3, P0-4, P0-7, P0-11; §Yêu cầu phi chức năng (≤ 2s trên 4G yếu; Safari iOS, Chrome Android, trình duyệt nhúng Zalo); G1 (≤ 60 giây)

## Overview

Hai trang cho khách trong chunk `customer`: `/t/:token` (thông tin bàn/quán, ETA, menu, giỏ, số điện thoại, đặt) và `/o/:id` (trạng thái 4 bước, cảnh báo 60 giây, huỷ). Có thể bắt đầu skeleton ngay sau phase 3 bằng MSW mock theo hợp đồng; nối API thật khi phase 4 xong.

## Key Insights

- Ngân sách ≤ 120 KB gzip JS cho chunk khách. Route khách chỉ dùng shadcn `Button`, `Input`, `Sheet` (giỏ), `Badge`; không kéo `Dialog`/`Select`/`Table`. React Query dùng chung (nhỏ); nếu vượt ngân sách thì thay bằng hook `usePolling` thuần `fetch`.
- `client_id`: `shared/api/client-id.ts` sinh UUID, lưu `localStorage` (`sc_client_id`), fallback cookie 1 năm khi `localStorage` ném lỗi (private mode / webview); mọi request gửi header `X-Client-Id`.
- Idempotency: khi bấm "Đặt nước", đọc `sessionStorage.sc_idem_<token>`; nếu chưa có thì sinh UUID và lưu **trước** khi gọi API; xoá khi nhận 2xx. Reload giữa chừng → cùng key → không trùng đơn (R10).
- Số điện thoại: lưu `localStorage.sc_phone` sau khi đặt thành công để điền sẵn (P0-11); validate `^0\d{9}$` phía client để báo ngay dưới ô, server vẫn validate lại.
- Giỏ lưu `sessionStorage` theo token; gộp dòng cùng `(product_id, sweet, ice)`; `qty` 1..20; tổng tính client chỉ để hiển thị, số server trả về là chân lý.
- Đồng hồ: mọi mốc "quá 60 giây" / "quá 5 phút" tính bằng `server_time - created_at` cộng thời gian trôi từ lúc nhận response, không dùng `Date.now()` trực tiếp (Risk Register).
- Realtime (A1): `shared/realtime/use-socket.ts` mở `/ws/customer?client_id&token[&order]`, parse `{type,data,server_time}`, reconnect backoff 1s→30s; khi không nối được trong 5s hoặc bị đóng liên tục → bật fallback polling 15s (REST `GET /api/t/{token}` / `GET /api/orders/{id}`) và ghi `console.info('ws_fallback')`; mỗi lần reconnect thành công thì refetch REST một lần để resync. Trang menu nhận `menu.updated` (cập nhật `available` và `ordering`); khi món trong giỏ chuyển `available=false` → dòng giỏ đánh dấu "Hết món", nút đặt khoá cho tới khi bỏ dòng (P0-3).
- Trang trạng thái nhận `order.updated`; đóng socket khi đơn đóng. Tab ẩn (`visibilitychange`) giữ socket, fallback polling (nếu đang dùng) giãn lên 30s.
- Chân trang: "Đồ uống do <tên người bán> pha và giao, không phải của quán" (P0-2, chủ quán #2). Tên người bán lấy từ `VITE_SELLER_NAME`.

## Requirements

- [x] `/t/:token`: header (tên quán, bàn, "Giao trong khoảng 7 phút" từ `eta_minutes`, "Trả tiền khi nhận, tiền mặt hoặc chuyển khoản"); banner khi `ordering.enabled=false` với lý do (`paused` → "Quán tạm ngưng nhận đơn", `closed` → "Ngoài giờ bán (HH:MM–HH:MM)"); danh sách món (ảnh nếu có, tên, giá, mờ + "Hết món" khi `available=false`); lối vào `my_orders` nếu có ("Đơn của bạn hôm nay: #AB12CD — Đang pha").
- [x] Chọn món: sheet với tuỳ chọn ngọt (Ít ngọt / Vừa / Ngọt) và đá (Không đá / Ít đá / Bình thường) chỉ hiện khi món hỗ trợ; mặc định Vừa / Bình thường; stepper số ly 1..20.
- [x] Giỏ: dòng gộp, sửa số ly, xoá, ghi chú ≤ 200 ký tự có đếm, ô SĐT bắt buộc + dòng "Chỉ dùng để báo trạng thái đơn qua Zalo", tổng tiền, nút "Đặt nước" (disabled khi giỏ rỗng / SĐT sai / có món hết / ordering tắt).
- [x] Đặt: gửi `Idempotency-Key`; 201/200 → điều hướng `/o/:id`, xoá giỏ + key; 409 `PRODUCT_UNAVAILABLE` → đánh dấu món, giữ giỏ; 409 `PAUSED|OUTSIDE_HOURS|QR_REVOKED` → banner tương ứng; 422 → lỗi dưới ô; lỗi mạng → giữ nguyên key, cho bấm lại.
- [x] `/o/:id`: mã đơn, quán, bàn, danh sách món (tên, tuỳ chọn, số ly, thành tiền), tổng; thanh 4 bước "Đã gửi → Quán nhận → Mang ra → Đã nhận nước"; trạng thái đóng (`rejected`/`cancelled`/`failed`) hiện thông báo tương ứng thay cho thanh bước; đơn `sent` quá 60s → hộp "Quán chưa xác nhận" với "Chờ thêm" (ẩn hộp 60s nữa) và "Huỷ đơn" (chỉ khi còn `sent`; gọi cancel, 409 → reload trạng thái).
- [x] `/revoked`: "Mã này không còn dùng"; GET menu 410 → điều hướng tới đây.
- [x] Trang lỗi chung cho 404 token và mất mạng ("Không tải được menu, kéo để thử lại").
- [x] Test vitest: gộp dòng giỏ, validate SĐT, tính "quá 60 giây" theo `server_time`, reducer trạng thái đặt hàng (key idempotency giữ/xoá đúng lúc), `use-socket` chuyển sang fallback khi WS lỗi và quay lại khi nối được (mock `WebSocket`); render test cho banner theo `reason`.
- [x] Ngân sách: `vite build` in kích thước chunk; script `pnpm size` fail nếu chunk khách > 120 KB gzip.

## Architecture

```text
features/customer-menu/
  api.ts            getMenu(token), createOrder(token, body, idemKey)
  cart.ts           reducer thuần: add/merge/update/remove, selectors total, hasUnavailable(products)
  hooks/useMenu.ts  fetch ban đầu + useSocket(menu.updated) + fallback poll 15s, 410 → navigate('/revoked')
  hooks/useCart.ts  reducer + sessionStorage
  components/       MenuHeader, OrderingBanner, ProductList, ProductSheet, CartSheet, PhoneField, Footer
  page.tsx
features/customer-order/
  api.ts            getOrder(id), cancelOrder(id)
  hooks/useOrder.ts fetch ban đầu + useSocket(order.updated) + fallback poll 15s, đóng khi đơn đóng
  timing.ts         elapsedSince(createdAt, serverTime, receivedAt)
  components/       StatusSteps, ClosedNotice, UnconfirmedPrompt, OrderItems
  page.tsx
shared/api/         http.ts (fetch wrapper: base URL, X-Client-Id, error envelope → ApiError), client-id.ts
shared/realtime/    use-socket.ts (connect, reconnect, fallback polling, resync), messages.ts (type union)
shared/lib/         money.ts (formatVND), phone.ts (isVNMobile), time.ts
```

## Related Code Files

Create:
- `apps/web/src/app/routes/customer.tsx` (lazy routes `/t/:token`, `/o/:id`, `/revoked`)
- `apps/web/src/features/customer-menu/**` và `apps/web/src/features/customer-order/**` như sơ đồ trên, kèm `*.test.ts(x)`
- `apps/web/src/shared/api/http.ts`, `client-id.ts`, `errors.ts`; `shared/realtime/use-socket.ts`, `messages.ts` + `use-socket.test.ts`; `shared/lib/money.ts`, `phone.ts`, `time.ts`; `shared/hooks/use-local-storage.ts`, `use-polling.ts`
- `apps/web/src/mocks/handlers.ts` (MSW, chỉ dev/test)
- `apps/web/scripts/check-size.mjs`

Modify:
- `apps/web/src/app/router.tsx`, `vite.config.ts` (manualChunks `customer`/`seller`), `package.json` (script `size`)

## Implementation Steps

1. `shared/api` + `client-id` + `errors` với test; MSW handlers theo hợp đồng.
2. `cart.ts` reducer + test (gộp, giới hạn 20, hasUnavailable).
3. Trang menu: header, banner, danh sách, sheet chọn món, sheet giỏ, SĐT, nút đặt; luồng idempotency key.
4. Trang trạng thái: poll, steps, closed notice, prompt 60s, huỷ.
5. Route `/revoked`, trang lỗi; tích hợp API thật khi phase 4 xong (bỏ MSW ở dev bằng flag `VITE_USE_MOCK`).
6. Đo bundle, Lighthouse mobile Slow 4G trên build preview; tối ưu (ảnh món `loading="lazy"`, font hệ thống, không web font).
7. Kiểm tra tay trên Safari iOS, Chrome Android, webview Zalo (quét QR bằng Zalo): `localStorage`, sheet cuộn, bàn phím số cho ô SĐT (`inputmode="numeric"`).

## Todo

- [x] shared api/client-id/errors + MSW
- [x] cart reducer + test
- [x] trang menu đầy đủ
- [x] luồng đặt + idempotency
- [x] trang trạng thái + huỷ + prompt 60s
- [x] revoked/404/offline
- [ ] bundle ≤ 120 KB gzip, Lighthouse đạt
- [ ] checklist 3 trình duyệt

## Success Criteria

- Luồng mẫu: mở `/t/DEVTEST001` → chọn 2 món → nhập SĐT → đặt → `/o/:id` hiện "Đã gửi" trong ≤ 60 giây thao tác tay (đo thử 3 lần).
- Bấm "Đặt nước" liên tục 5 lần hoặc reload giữa chừng → chỉ một đơn trong DB.
- Tắt món trên admin → menu khách mờ món đó trong ≤ 2s qua WS (≤ 15s khi fallback); nếu món trong giỏ → nút đặt khoá kèm nhãn.
- Người bán bấm "Nhận đơn" → trang khách đổi bước trong ≤ 2s qua WS (≤ 15s khi fallback) không reload.
- Chặn `/ws` bằng DevTools → trang vẫn cập nhật qua fallback polling, console có `ws_fallback`.
- Đóng tab, quét lại cùng bàn trong ngày → thấy lối vào đơn đang chạy.
- `pnpm test` xanh; `pnpm size` đạt; Lighthouse mobile LCP ≤ 2.5s.

## Risk Assessment

- Webview Zalo chặn `localStorage`: fallback cookie; nếu cả hai hỏng, `client_id` sinh mỗi lần và "nhớ đơn" không hoạt động, đặt đơn vẫn chạy.
- Webview Zalo hoặc mạng 4G chặn WebSocket: fallback polling 15s giữ trang hoạt động; đo tỷ lệ fallback trong chạy thử (xem giả định chịu tải ở `architecture.md`).
- shadcn `Sheet` kéo Radix Dialog (~15 KB gz): chấp nhận trong ngân sách; nếu vượt, thay bằng bottom sheet tự viết.
- Bàn phím iOS che nút đặt trong sheet: dùng `100dvh` và `scroll-padding`, kiểm tra tay.

## Security Considerations

- Không render HTML từ dữ liệu API (tên món, ghi chú) ngoài text node.
- Không lưu gì ngoài `client_id`, giỏ, SĐT, idempotency key ở client; không lưu lịch sử đơn (server có `my_orders`).

## Next Steps

Phase 9 chạy E2E Playwright trên luồng này.
