# API

Hợp đồng HTTP và WebSocket của `apps/api`. Nguồn chân lý là code (`apps/api/internal/features/*/handler.go`, `dto.go`); tài liệu này tóm tắt để web, notifier và người vận hành tra cứu.

## Quy ước chung

- JSON UTF-8. Tiền là số nguyên VND. Thời gian là RFC 3339 (`2026-10-01T08:00:00+07:00`).
- Lỗi luôn có dạng:

  ```json
  { "error": { "code": "MA_LOI", "message": "Câu tiếng Việt cho người dùng", "details": { } } }
  ```

  `422 VALIDATION` có `details.fields` theo tên field JSON, ví dụ `{"phone": "...", "items[0].qty": "..."}`.
- Mọi request có thể gửi `X-Request-Id`; server trả lại header này (sinh mới nếu thiếu) để dò log.
- Response cần đồng bộ đồng hồ (đơn, danh sách đơn, menu) có `server_time`. Web tính "quá 60 giây" theo `server_time`, không theo đồng hồ máy khách.

| Mã lỗi | HTTP | Khi nào |
|--------|------|---------|
| `CLIENT_ID_REQUIRED` | 400 | Route khách thiếu `X-Client-Id` dạng UUID |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | POST đơn thiếu `Idempotency-Key` dạng UUID |
| `INVALID_JSON` | 400 | Body không phải JSON hợp lệ hoặc có field lạ |
| `UNAUTHENTICATED` | 401 | Thiếu/hết hạn cookie phiên, hoặc sai bearer `/internal` |
| `INVALID_PASSWORD` | 401 | Đăng nhập sai mật khẩu |
| `NOT_OWNER` | 403 | Khách huỷ đơn của máy khác |
| `QR_NOT_FOUND`, `ORDER_NOT_FOUND`, `PARTNER_NOT_FOUND`, `PRODUCT_NOT_FOUND`, `NOTIFICATION_NOT_FOUND` | 404 | |
| `QR_REVOKED` | 410 (GET menu) / 409 (POST đơn) | Mã đã thu hồi |
| `PAUSED`, `OUTSIDE_HOURS`, `PARTNER_INACTIVE` | 409 | Không nhận đơn; `OUTSIDE_HOURS` có `details.hours_today` |
| `PRODUCT_UNAVAILABLE` | 409 | `details.product_ids`: mọi món hết/ẩn trong giỏ |
| `IDEMPOTENCY_MISMATCH` | 409 | Key đã dùng bởi máy khác |
| `INVALID_TRANSITION` | 409 | Chuyển trạng thái không hợp lệ hoặc thua cuộc đua; `details.current_status` |
| `BANK_NOT_CONFIGURED` | 409 | VietQR khi chưa cài tài khoản ngân hàng |
| `VALIDATION` | 422 | |
| `RATE_LIMITED` | 429 | Có header `Retry-After` |

## Vận hành

| Method | Path | |
|--------|------|-|
| GET | `/healthz`, `/api/healthz` | Tiến trình sống (`/api/healthz` để thử đường proxy) |
| GET | `/readyz` | Ping DB (timeout 1 giây); 503 nếu DB không trả lời |

## Khách (công khai, header `X-Client-Id: <uuid>` bắt buộc)

`client_id` là UUID do web sinh, lưu `localStorage` (fallback cookie). Không phải dữ liệu cá nhân.

### `GET /api/t/{token}`

Menu của bàn. Ghi một page view (mỗi mã QR, mỗi ngày theo `APP_TZ`, mỗi `client_id` một lần). `404 QR_NOT_FOUND`, `410 QR_REVOKED`.

```json
{
  "partner": { "name": "Quán test" },
  "table_label": "Bàn 1",
  "eta_minutes": 7,
  "ordering": { "enabled": false, "reason": "closed", "hours_today": ["11:00–13:30"] },
  "products": [{ "id": "…", "name": "Bạc xỉu", "price": 29000, "image_url": null, "has_sweet": true, "has_ice": true, "available": true }],
  "my_orders": [{ "id": "…", "code": "AB12CD", "status": "accepted" }],
  "server_time": "…"
}
```

`ordering.reason`: `paused` (tạm ngưng) > `closed` (ngoài giờ) > `inactive` (quán ngừng). Món ẩn của quán không có trong `products`. `my_orders`: tối đa 5 đơn của thiết bị này tại bàn này trong ngày.

### `POST /api/t/{token}/orders`

Header `Idempotency-Key: <uuid>`. Rate limit 10/phút theo `client_id` và 30/phút theo IP.

```json
{ "items": [{ "product_id": "…", "qty": 2, "sweet": "less", "ice": "none" }], "note": "ít đá", "phone": "0901234567" }
```

- `qty` 1..20 (sau khi gộp dòng cùng món + tuỳ chọn); 1..30 dòng; `note` ≤ 200 ký tự.
- `sweet ∈ {less, medium, sweet}`, `ice ∈ {none, less, normal}`; chỉ gửi khi món có tuỳ chọn đó, vắng thì mặc định `medium`/`normal`.
- `phone` không bắt buộc: vắng, rỗng hoặc chỉ có khoảng trắng → `customer_phone = null` và khách không nhận tin trạng thái. Có giá trị thì phải là 10 số bắt đầu bằng 0 sau khi bỏ khoảng trắng/dấu chấm/gạch; `+84` được đổi thành `0`.
- Server tự tra giá và gộp dòng. `201` đơn mới; `200` khi key đã dùng (trả lại đơn cũ, bỏ qua body).
- Response: view công khai của đơn (xem dưới) + `server_time`.

### `GET /api/orders/{id}` và `POST /api/orders/{id}/cancel`

View công khai (không có SĐT, không có `client_id`):

```json
{
  "id": "…", "code": "AB12CD", "status": "sent",
  "items": [{ "product_id": "…", "name": "Bạc xỉu", "unit_price": 29000, "qty": 2, "sweet": "less", "ice": "normal", "line_total": 58000 }],
  "note": null, "total": 58000, "partner_name": "Quán test", "table_label": "Bàn 1",
  "cancel_reason": null, "payment_method": null,
  "created_at": "…", "accepted_at": null, "delivering_at": null, "paid_at": null, "closed_at": null, "updated_at": "…",
  "menu_path": "/t/AbC123", "eta_minutes": 7, "notify_zalo": true,
  "server_time": "…"
}
```

- `menu_path`: đường tương đối về menu của bàn (`/t/` + token đã mã hoá URL) cho nút "Gọi thêm nước"; origin web tự ghép nên chạy được khi web và API khác host. Luôn có, kể cả khi mã đã thu hồi (trang menu khi đó chuyển sang `/revoked`).
- `eta_minutes`: cài đặt thời gian pha hiện tại của người bán, đọc lúc trả hoặc phát tin.
- `notify_zalo`: `true` chỉ khi đơn có SĐT **và** Zalo đang liên kết, phiên chưa hết hạn. Chỉ lộ cờ này, không bao giờ lộ SĐT; SĐT bị xoá khi purge người nhận nên đơn cũ thành `false`.

Huỷ chỉ khi `X-Client-Id` trùng máy đặt (`403 NOT_OWNER`) và đơn còn `sent` (`409 INVALID_TRANSITION`).

## Người bán (cookie `sc_session`)

Cookie HttpOnly, SameSite=Lax, Secure khi `PUBLIC_BASE_URL` là https, hạn 30 ngày, ký HMAC-SHA256 bằng `SESSION_SECRET`.

| Method | Path | Ghi chú |
|--------|------|---------|
| POST | `/api/seller/login` | `{password}`; rate limit 5/phút/IP |
| POST | `/api/seller/logout` | 204, xoá cookie |
| GET | `/api/seller/me` | `{authenticated, expires_at}` |
| GET | `/api/seller/orders?scope=open\|closed&updated_after=<rfc3339>` | `{orders, server_time}`. `open`: sent/accepted/delivering, cũ trước. `closed`: đóng từ đầu ngày. Không có `scope` + `updated_after`: mọi đơn đổi sau mốc, mới nhất trước. Tối đa 300 đơn. Mã hoá URL tham số thời gian (`+07:00`). |
| GET | `/api/seller/orders/{id}` | View người bán: view công khai trừ `eta_minutes, notify_zalo`, thêm `partner_id, qr_token, customer_phone, commission_rate, commission_amount` |
| POST | `/api/seller/orders/{id}/transition` | `{to, expected_from, payment_method?, reason?}`; `payment_method ∈ {cash, transfer}` bắt buộc khi `to=paid`, cấm khi khác |
| GET | `/api/seller/orders/{id}/vietqr` | `{payload, amount, purpose, bank_bin, bank_account, bank_account_name}` |
| GET / PUT | `/api/seller/settings` | `{accepting_orders, eta_minutes, bank_bin, bank_account, bank_account_name, updated_at}`. PUT cập nhật từng phần; chuỗi rỗng xoá thông tin ngân hàng |
| GET / POST | `/api/seller/products` | `{products:[…]}` / tạo (201). Body `{name, price, image_url? (chỉ https://), has_sweet, has_ice, available?, sort}` |
| PUT | `/api/seller/products/{id}` | Thay toàn bộ |
| PATCH | `/api/seller/products/{id}/availability` | `{available}` |
| GET / POST | `/api/seller/partners` | `{partners:[…]}` / tạo. Body `{name, commission_rate (0..1, ≤ 4 chữ số thập phân), payout_period: week\|month, open_hours, active?, hidden_product_ids}` |
| GET / PUT | `/api/seller/partners/{id}` | Không có xoá: ngừng hợp tác thì `active=false` |
| GET / POST | `/api/seller/partners/{id}/qrcodes` | `{qrcodes:[…]}` / `{table_label}` → `{token, url, table_label, active, created_at, revoked_at}` |
| POST | `/api/seller/qrcodes/{token}/revoke` | Idempotent |
| GET | `/api/seller/reports/commission?partner_id&period=current\|previous` hoặc `&from&to` | `{rows:[…], total}`; mặc định `period=current`. Mỗi dòng có `from/to` riêng (quán tuần/tháng khác nhau) |
| GET | `/api/seller/reports/commission/export?partner_id&…` | `text/plain`; bắt buộc `partner_id`; không có SĐT |
| GET | `/api/seller/reports/funnel?from&to&partner_id` | `{from, to, rows:[{partner_id, partner_name, day, views, orders, paid}]}`; mặc định 7 ngày |
| GET / POST | `/api/seller/adjustments` | Lọc `partner_id, from, to` hoặc `period` (kèm `partner_id`); POST `{partner_id, amount ≠ 0, reason, order_code?}` |
| GET | `/api/seller/notifier/status` | `{healthy, last_seen_at, session_ok, message, failed_last_hour}`; `failed_last_hour` chỉ đếm tin báo **người bán** gửi lỗi. Khi phiên Zalo hết hạn: `session_ok=false` và `message` là câu hoàn chỉnh để hiện nguyên văn trên banner |
| GET | `/api/seller/zalo` | `{configured, linked, status: ""\|linked\|expired, display_name, linked_at}`. Thiếu `ZALO_CREDENTIAL_KEY` → `{configured:false, linked:false, …}` (vẫn 200). Không bao giờ trả credentials |
| DELETE | `/api/seller/zalo` | Ngắt kết nối, xoá hẳn credentials đã mã hoá; `204`, idempotent |
| POST | `/api/seller/zalo/link` | `{consent_version}` (bắt buộc, ≤ 64 ký tự) → `202 {link_id}`. Bắt đầu một lần quét QR; lần mới thay lần cũ đang chạy |
| GET | `/api/seller/zalo/link/{id}` | `{link_id, state, qr_png_base64?, display_name?, failure?}`; `state ∈ {pending, qr_ready, scanned, confirmed, linked, expired, error}`, ba trạng thái cuối là kết thúc. Poll mỗi 1,5 giây. `404 ZALO_LINK_NOT_FOUND` khi id sai hoặc đã dọn |
| DELETE | `/api/seller/zalo/link/{id}` | `204`. Dừng lần quét đang mở (nút "Huỷ"); chỉ trả về khi attempt đã dừng, nên lần quét vừa kịp xong đã được lưu và `GET /api/seller/zalo` đọc sau đó là trạng thái cuối. Idempotent: id cũ/lạ vẫn `204`; id không phải UUID → `404 ZALO_LINK_NOT_FOUND` |

Mọi route của `/api/seller/zalo*` trừ `GET /api/seller/zalo` (trả `configured:false`) trả `503 ZALO_NOT_CONFIGURED` khi API chạy không có `ZALO_CREDENTIAL_KEY`.

`open_hours`: `[{days: [1..7], from: "HH:MM", to: "HH:MM"}]`, 1 = Thứ Hai … 7 = Chủ Nhật. Hai đầu tính theo phút và đều bao gồm. `to < from` là khung qua nửa đêm, thuộc ngày bắt đầu.

Máy trạng thái (`to` hợp lệ theo `expected_from`):

| Từ | Tới | Ai |
|----|-----|----|
| `sent` | `accepted`, `rejected` | người bán |
| `sent` | `cancelled` | khách, hoặc hệ thống sau 5 phút |
| `accepted` | `delivering` | người bán |
| `delivering` | `paid` (kèm `payment_method`), `failed` | người bán |

`paid` không có chuyển đi nào. Khi `paid`, `commission_rate` được chép từ quán và `commission_amount = ROUND(total × rate)` được ghi cứng; báo cáo chỉ cộng các cột này.

## Nội bộ cho dịch vụ notifier Zalo (`Authorization: Bearer <NOTIFIER_TOKEN>`)

Reverse proxy trả 404 cho `/internal/*`; notifier gọi thẳng `http://api:8080` trong mạng docker.

Tin `customer_status` do worker chạy **trong process API** gửi qua tài khoản Zalo kết nối ở Cài đặt (claim/ack cùng outbox, cùng lease, backoff và hạn 30 phút). Các route dưới đây vẫn giữ cho một notifier ngoài nếu sau này viết để gửi `seller_new_order`; worker trong API cũng ghi heartbeat mỗi 30 giây (`session_ok=false` chỉ khi phiên Zalo hết hạn), nên đừng chạy song song một notifier ngoài cũng gửi heartbeat. SĐT không tìm thấy trên Zalo → tin `failed` ngay, không thử lại; phiên hết hạn → tin nằm lại `pending`, không tốn lượt thử.

| Method | Path | |
|--------|------|-|
| GET | `/internal/notifications/pending?limit=20` | Tối đa 100. Trả `{notifications:[{id, kind, order_id, recipient, payload, attempts, created_at}]}` và khoá mềm 60 giây: không ack thì tin quay lại hàng đợi. Tin `pending` quá 30 phút bị đánh dấu `failed` (`last_error = expired`) thay vì gửi muộn |
| POST | `/internal/notifications/{id}/ack` | `{ok: true}` → `sent`. `{ok: false, error}` → `attempts+1`, thử lại sau 30s·2^(attempts−1); lần thứ 3 lỗi → `failed`. Tin báo người bán `failed` bật cảnh báo đỏ trên màn người bán (P0-5); tin gửi khách `failed` chỉ ghi log (P0-11). Ack tin đã xử lý là no-op |
| POST | `/internal/notifier/heartbeat` | `{session_ok, message?}` mỗi 30 giây. Quá 90 giây không có heartbeat → `healthy=false` |

`kind = seller_new_order` (recipient `seller`, khi tạo đơn) hoặc `customer_status` (recipient = SĐT khách, khi tới `accepted`, `delivering`, `paid`, `rejected`, `cancelled` do quá hạn). Payload:

```json
{ "order_id": "…", "code": "AB12CD", "partner_name": "Quán test", "table_label": "Bàn 1", "status": "accepted",
  "cancel_reason": "timeout", "total": 58000, "items_summary": "2 Bạc xỉu (ít ngọt)",
  "seller_url": "https://<domain>/seller/orders/<id>", "order_url": "https://<domain>/o/<id>" }
```

## WebSocket

Mọi message: `{type, data, server_time}`. Server gửi `{"type":"ping"}` mỗi 30 giây (client coi im lặng quá 65 giây là chết và nối lại). Origin phải trùng host của `PUBLIC_BASE_URL`.

| Endpoint | Xác thực | Message |
|----------|----------|---------|
| `GET /ws/seller` | cookie phiên | `order.created {order}`, `order.updated {order}` (view người bán), `settings.updated {settings}`, `notifier.status {status}` |
| `GET /ws/customer?client_id=&token=&order=` | `token` còn hiệu lực; `order` thuộc `client_id` | `order.updated {order}` (view công khai), `menu.updated {products, ordering}` hoặc `menu.updated {revoked: true}` |

Sai quyền: server nâng cấp rồi đóng với mã `4403` (client ngừng thử lại, chỉ polling). `/ws/customer` giới hạn 60 lần mở/phút/IP. Client luôn gọi lại REST sau mỗi lần (re)connect; không nối được trong 5 giây hoặc bị đóng thì polling REST 15 giây (30 giây khi tab ẩn). Màn người bán resync bằng `scope=open` (toàn bộ đơn đang mở) rồi hỏi lại từng đơn đang hiện mà không còn mở, nên không phụ thuộc mốc thời gian. Trang menu ngoài giờ bán tự tải lại mỗi phút (server không phát sự kiện theo mốc giờ).

`menu.updated` mang danh sách món đầy đủ (không chỉ `{id, available}` như bản nháp kiến trúc) để trang menu vẽ lại cả món mới thêm mà không phải gọi REST.
