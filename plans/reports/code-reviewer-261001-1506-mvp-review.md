# Review MVP "Gọi nước tại bàn qua mã QR"

Ngày: 2026-10-01 · Người review: code-reviewer · Phạm vi: `apps/api/**`, `apps/web/src/**`, `apps/web/e2e/**`, `infra/**`, `Makefile`, `.github/workflows/*`, Dockerfile, `nginx.conf`. Đối chiếu với `architecture.md` §3–§5, các file phase và `prd.md` P0-1 → P0-11.

## Phạm vi và cách kiểm

- Đọc toàn bộ handler/service/repository/dto của 10 feature API, platform (`realtime`, `middleware`, `httpx`, `config`, `db`), migration, toàn bộ `features/*` và `shared/*` của web.
- Lệnh đã chạy: `go vet ./...` và `go test -count=1 ./...` (unit, không tag) đều xanh. Chạy `Date.parse` trên WebKit (Playwright) để kiểm timestamp 6 chữ số thập phân: đúng. Chạy `caddy validate` (image `caddy:2-alpine`) cho `infra/caddy/Caddyfile` với `ACME_EMAIL` rỗng và có giá trị.
- Không sửa file nào, không commit, không chạy dev server.

## Đánh giá chung

Mã chắc tay ở các bất biến chính. Hợp đồng web admin ↔ DTO Go khớp. Không tìm thấy lỗi Critical. Các lỗi có tác động thật nằm ở **đường resync của bảng đơn người bán** (con trỏ `updated_after`) và ở **ngữ nghĩa outbox/cảnh báo notifier**. Đường resync là kênh chính theo PRD P0-5, và khi hỏng thì đơn mất im lặng, không có lỗi nào hiện ra.

---

## Critical

Không có.

## High

### H1. Resync bảng đơn có thể bỏ sót đơn mới khi có trên 300 đơn đổi kể từ lần tải REST gần nhất

- **Vị trí:**
  - `apps/web/src/features/seller-orders/store.ts:38-46`: `lastServerTime` chỉ được đặt trong action `loaded`.
  - `apps/web/src/features/seller-orders/board-context.tsx:48-59`: resync gọi `listOrders({ updatedAfter })` và không truyền scope.
  - `apps/api/internal/features/orders/repository.go:40-54`: khi không có scope thì `ORDER BY updated_at ASC LIMIT 300`.
  - `apps/api/internal/features/orders/handler.go:102`: `server_time` trả về là "bây giờ".
- **Lỗi:** khi WS khoẻ, con trỏ không tiến: message `order.*` không cập nhật `lastServerTime`. Lần reconnect sau đó hỏi mọi đơn đổi kể từ lần tải đầu. Server trả **300 đơn cũ nhất** (sắp ASC), còn client đặt con trỏ thành `server_time` hiện tại. Các đơn mới nhất bị bỏ qua vĩnh viễn.
- **Thêm áp lực:** job xoá SĐT lúc 03:00 (`orders/writer.go:130`) set `updated_at = now()` cho mọi đơn tròn 90 ngày. Mỗi đêm các đơn này cũng lọt vào tập resync.
- **Kịch bản:** máy ở quầy mở bảng đơn liên tục 7 ngày, khoảng 50 đơn/ngày, WS không rớt (đúng mô tả PRD "để mở trên một máy cố định"). Wi-Fi rớt 1 phút, trong lúc đó khách đặt đơn X. Khi reconnect, resync nhận 300 đơn của tuần trước, `X` không có trong kết quả, và `lastServerTime` đã thành "bây giờ".
- **Kết quả:** không có thẻ đơn X, không có chuông. Scheduler tự huỷ X sau 5 phút.
- **Hướng sửa (chọn một):**
  - (a) API trả `has_more` và client lặp lại với `updated_after = updated_at` của dòng cuối cho tới khi hết.
  - (b) Client tiến `lastServerTime` theo `server_time` của mỗi message WS (lưu ý cộng thêm biên an toàn như ở M1).
  - Tối thiểu: tăng `listLimit` cho nhánh `updated_after` và log cảnh báo khi số dòng chạm limit.

## Medium

### M1. Con trỏ `updated_after` có khe đua với thời điểm commit, nên khi đang polling có thể mất đơn

- **Vị trí:**
  - `apps/api/internal/features/orders/writer.go:65`: `updated_at = now()`, mà `now()` của Postgres là thời điểm **bắt đầu transaction**.
  - `writer.go:90` và `service.go:108`: khi tạo đơn, `updated_at` là `now` của Go, lấy trước INSERT, event, outbox và COMMIT.
  - `handler.go:102`: `server_time` lấy trước khi đọc.
- **Lỗi:** một đơn có `updated_at = t0` nhưng commit ở `t2`. Nếu lần poll chạy ở `t1` (t0 < t1 < t2), snapshot chưa thấy đơn. Lần poll sau hỏi `updated_at > t1`, nên cũng không thấy. Đơn không bao giờ được trả về nữa. Lệch đồng hồ giữa container Go và Postgres (nếu sau này dùng DB ngoài) mở rộng khe này.
- **Kịch bản:** màn người bán ở chế độ fallback (banner vàng, WS bị proxy chặn). Khách đặt đúng lúc poll 15 giây đang chạy.
- **Kết quả:** đơn không lên bảng, không chuông, tự huỷ sau 5 phút. Khi WS khoẻ thì publish sau commit che được lỗi, nên lỗi chỉ lộ ở fallback và reconnect. Xác suất mỗi lần thấp (cửa sổ vài ms trên 15 giây), nhưng hậu quả là mất đơn.
- **Hướng sửa:** trả `server_time` lùi một biên an toàn (ví dụ trừ 5 giây), hoặc client trừ biên khi gửi `updated_after`. `upsert` theo `updated_at` vốn idempotent và đã chặn chuông trùng (`store.ts:31`), nên trả trùng không gây hại.

### M2. Bảng đơn tải lần đầu lỗi thì đứng luôn: không retry, không nút thử lại

- **Vị trí:** `apps/web/src/features/seller-orders/board-context.tsx:38-63` và `pages/board.tsx:20-22`.
- **Lỗi:** `initialLoad` chỉ chạy một lần khi mount. Nếu lỗi, `loaded=false`, nên `useSocket(null)`: không WS, không polling. Trang chỉ hiện chữ lỗi, không có nút.
- **Kịch bản:** người bán mở `/seller` đúng lúc API restart (deploy, `MIGRATE_ON_START`) hoặc mạng chập chờn, nhận 502 hoặc lỗi mạng. Bảng hiện "Máy chủ đang bận…" mãi mãi. Cả buổi không có đơn, không chuông, cho tới khi người bán tự tải lại trang.
- **Hướng sửa:** retry có backoff (1s → 30s) trong `initialLoad`, kèm nút "Thử lại" giống `RequireSeller`.

### M3. Tin gửi khách thất bại cũng bật banner đỏ "Zalo không gửi được tin", trái PRD P0-11

- **Vị trí:** `apps/api/internal/features/notifications/service.go:187` (đếm `failed` không lọc `kind`), `service.go:154` (mọi tin chuyển `failed` đều force publish), `apps/web/src/features/seller-orders/components/notifier-banner.tsx`.
- **Lỗi:** PRD P0-11 nói gửi tin cho khách lỗi (số không dùng Zalo, khách chặn người lạ) thì "ghi log và bỏ qua". Code lại tính tin `customer_status` vào `failed_last_hour`. Phase-05 viết đúng như code, nên đây là lệch giữa plan và PRD, không phải lỗi cài đặt.
- **Kịch bản:** một khách chặn tin người lạ. Notifier ack `ok:false` 3 lần, tin chuyển `failed`, màn người bán đỏ 1 giờ dù tin cho người bán vẫn gửi tốt. Lỗi này lặp nhiều lần mỗi ngày.
- **Kết quả:** người bán quen với banner đỏ và bỏ qua nó, nên khi kênh báo người bán hỏng thật thì không ai để ý.
- **Phụ:** đếm theo `created_at` chứ không theo thời điểm chuyển `failed`.
- **Hướng sửa:** `failed_last_hour` chỉ đếm `kind = 'seller_new_order'`, theo thời điểm fail (thêm cột hoặc dùng `next_attempt_at`/`sent_at`). Nếu cần thì tách riêng số tin khách lỗi để hiển thị.

### M4. Outbox không có hạn: notifier sống lại sẽ gửi dồn tin cũ, và SĐT trong tin `pending` không bao giờ bị xoá

- **Vị trí:** `apps/api/internal/features/notifications/service.go:80-89` (`Claim` không lọc theo tuổi tin), `enqueuer.go:49` (`PurgeRecipients` bỏ qua `status = 'pending'`).
- **Kịch bản 1:** notifier chết từ 11:00 tới 17:00, 40 đơn tích lại. Khi notifier sống lại, `Claim` trả hết theo `id`. Khách nhận "Quán đã nhận đơn" muộn 6 tiếng, người bán nhận 40 tin "đơn mới" đã xong. Gửi dồn tin tới người lạ làm tăng rủi ro tài khoản Zalo bị khoá (PRD P0-5, ghi chú rủi ro).
- **Kịch bản 2:** notifier chưa từng được triển khai (nằm ngoài plan). Mọi tin `customer_status` ở trạng thái `pending` mãi mãi, nên `recipient` (SĐT) còn quá 90 ngày, trái PRD §Dữ liệu cá nhân.
- **Hướng sửa:**
  - `Claim` chỉ lấy tin trẻ hơn N phút (ví dụ 15). Tin quá hạn chuyển `failed` với `last_error='expired'`.
  - `PurgeRecipients` xoá cả tin `pending` quá hạn giữ SĐT.

### M5. Trang menu khách không tự mở hoặc khoá khi tới giờ bán

- **Vị trí:** `apps/api/internal/features/menu/service.go:84` (gate chỉ tính lúc GET), `menu/broadcaster.go` (chỉ phát khi dữ liệu đổi, không phát theo mốc giờ), `apps/web/src/features/customer-menu/hooks/use-menu.ts` (khi WS khoẻ thì không poll).
- **Kịch bản:** quán bán 11:00–13:30. Khách ngồi sẵn và quét lúc 10:55, thấy "Ngoài giờ bán (11:00–13:30)". WS vẫn nối nên không có resync. Tới 11:05 nút "Đặt nước" vẫn khoá cho tới khi khách tự tải lại trang, đúng lúc mở bán trưa.
- **Chiều ngược lại** (quá 13:30 vẫn mở) được server chặn bằng 409 `OUTSIDE_HOURS` rồi reload, nên chấp nhận được.
- **Hướng sửa:** API trả thêm `ordering.next_change_at` và client đặt timer reload tại mốc đó. Hoặc client tự đặt timer theo `hours_today` cộng `server_time`.

### M6. Caddy không khởi động khi `ACME_EMAIL` rỗng (đã kiểm chứng)

- **Vị trí:** `infra/caddy/Caddyfile:2` (`email {$ACME_EMAIL}`), `infra/docker-compose.prod.yml:62` (`ACME_EMAIL: ${ACME_EMAIL:-}`, tức là cho phép rỗng).
- **Kiểm chứng:** `caddy validate` với `ACME_EMAIL=` báo `parsing caddyfile tokens for 'email': wrong argument count … Caddyfile:2`. Khi có giá trị thì báo `Valid configuration`.
- **Kết quả:** người vận hành để trống biến này (compose ngầm báo là tuỳ chọn) thì Caddy restart liên tục và cả site sập.
- **Hướng sửa:** đổi thành `${ACME_EMAIL:?…}` trong compose, hoặc bỏ khối global `email`.

## Low

### L1. Trang trạng thái đơn ghi đè state mà không so `updated_at`

- **Vị trí:** `apps/web/src/features/customer-order/hooks/use-order.ts:25` và `:47`.
- **Lỗi:** `onopen` gọi `load()`. Nếu message WS `paid` tới trước response REST (đọc lúc còn `delivering`), REST ghi đè về `delivering`. Trang vẫn coi đơn đang mở, WS vẫn nối nhưng không còn event nào, nên khách thấy "Đang mang ra" mãi.
- **Hướng sửa:** chỉ nhận bản có `updated_at` mới hơn bản đang có, giống `store.ts:29`.

### L2. `menu.updated` có thể tới sai thứ tự

- **Vị trí:** `apps/api/internal/features/menu/broadcaster.go:48`.
- **Lỗi:** mỗi lần đổi món chạy một goroutine riêng: đọc snapshot rồi publish. Payload không có version. Hai lần bật/tắt sát nhau thì snapshot cũ có thể publish sau snapshot mới, và khách thấy món "còn" trong khi đã hết.
- **Giảm nhẹ hiện có:** server vẫn chặn đơn bằng `PRODUCT_UNAVAILABLE`.
- **Hướng sửa:** chạy broadcast tuần tự qua một worker (channel), hoặc gắn version/`updated_at` để client bỏ bản cũ.

### L3. `image_url` nhận `http://` nhưng production không hiển thị được

- **Vị trí:** `apps/api/internal/features/products/service.go:106`, `apps/web/src/features/admin-products/components/product-form.tsx:26`.
- **Lỗi:** CSP `img-src 'self' https: data: blob:` (`Caddyfile:15`), cộng thêm việc trình duyệt chặn mixed content trên https, nên ảnh `http://` vỡ trên trang khách.
- **Hướng sửa:** chỉ chấp nhận `https://` ở cả API và form.

### L4. Lỗi 422 `items[i].sweet` hoặc `items[i].ice` không chỉ ra dòng nào

- **Vị trí:** `apps/api/internal/features/orders/pricing.go:63`, `apps/web/src/features/customer-menu/cart.ts:63-75` (`refreshPrices` chỉ đồng bộ giá và tên).
- **Kịch bản:** người bán tắt "có đá" của món đang nằm trong giỏ khách. Khi đặt, khách chỉ thấy "Dữ liệu chưa hợp lệ" mà không biết dòng nào sai.
- **Hướng sửa:** `refreshPrices` bỏ `sweet`/`ice` khi món không còn hỗ trợ, hoặc map `fields` lên dòng trong giỏ.

### L5. Bản xuất hoa hồng ghi tỷ lệ hiện tại cạnh tổng hoa hồng đã chốt

- **Vị trí:** `apps/api/internal/features/reports/export.go:49`.
- **Kịch bản:** quán đổi từ 15% sang 10% giữa kỳ. Bản gửi chủ quán ghi "Hoa hồng 10%: <tổng gồm cả các đơn tính 15%>", nên chủ quán đối chiếu thấy lệch.
- **Hướng sửa:** khi tỷ lệ trong kỳ không đồng nhất thì không in %, hoặc in "theo tỷ lệ từng đơn".

### L6. `/ws/customer` không có rate limit hay giới hạn số kết nối

- **Vị trí:** `apps/api/internal/app/router.go:123`.
- **Lỗi:** endpoint không xác thực; mỗi lần mở chạy 1–2 truy vấn DB và giữ một goroutine cùng buffer 32. Một client có thể mở hàng nghìn kết nối tới token in trên bàn.
- **Hướng sửa:** áp `RateLimit(ByIP)` cho route và đặt trần kết nối mỗi IP trong hub.

### L7. Đường production qua Caddy chưa được E2E chạm tới

- **Vị trí:** `make e2e` dùng profile `full`, tức nginx trong image web. Caddy (CSP, `encode zstd gzip` trên `/ws/*`, `read_timeout 0`) chưa từng chạy cùng app.
- **Đã đọc và không thấy lỗi:** CSP cho phép `wss://{$DOMAIN}`, `style 'unsafe-inline'` (cần cho thẻ `<style>` của trang in và style inline của Radix), `img data:/blob:` (cần cho tải PNG QR).
- **Hướng sửa:** thêm smoke test (Caddy với `tls internal`, mở `/ws/seller` và một trang khách) trước khi go-live.

### L8. Tài liệu hợp đồng lệch với code (web đã xử lý đúng theo code)

- **Vị trí:** `architecture.md` §5 chưa ghi:
  - `ordering.reason = "inactive"` và mã 409 `PARTNER_INACTIVE` (`menu/gate.go`);
  - `ordering.hours_today`;
  - payload `menu.updated {revoked:true}` (`qrcodes/service.go`), vốn khác hình dạng `{products, ordering}`;
  - `GET /api/seller/orders` không có `scope` (đường resync dùng);
  - `menu.updated.products` là view đầy đủ chứ không chỉ `{id, available}`.
- **Hướng sửa:** cập nhật §5 để notifier và client sau này không viết theo hợp đồng cũ.

---

## Đã kiểm, không có lỗi (để hiệu chỉnh mức rủi ro)

- **Hợp đồng web admin ↔ API:** khớp toàn bộ.
  - Hình dạng response: `{products}`, `{partners}`, `{qrcodes}`, `{rows,total}`, `{adjustments}`, `{notifications}`.
  - Tên field và kiểu: `commission_rate` là số 0..1, form đổi % ↔ tỷ lệ bằng `Math.round(x*100)/10000`, qua được kiểm tra 4 chữ số thập phân của Go.
  - `image_url: null`, `hidden_product_ids` luôn gửi, `available` tuỳ chọn ở PUT món.
  - PUT settings cập nhật từng phần: form chỉ gửi nhóm field của mình, `PauseSwitch` chỉ gửi `accepting_orders`.
  - Export trả `text/plain`.
  - `DisallowUnknownFields`: không form nào gửi field lạ.
- **Bất biến đơn `paid`:** chỉ `orders/writer.go` chứa `INSERT/UPDATE orders`. `SetClause` có allowlist cột, mọi UPDATE kèm `status = $from`, `from = paid` bị chặn. Hook GORM chặn đường ORM.
- **Idempotency:** dùng `ON CONFLICT DO NOTHING` trong savepoint rồi SELECT lại (READ COMMITTED). Khác client thì 409 `IDEMPOTENCY_MISMATCH`.
- **Hoa hồng:** `decimal.Round(0)` làm tròn nửa xa 0, trùng `ROUND` numeric. Báo cáo chỉ SUM `commission_amount`.
- **Gate giờ qua nửa đêm và `APP_TZ`:** đúng. Distroless static có tzdata.
- **WS:**
  - Publish sau commit; slow consumer bị kick.
  - Origin kiểm bằng `OriginPatterns` theo `PUBLIC_BASE_URL`.
  - Topic khách kiểm `client_id` khớp đơn và token còn active.
  - `net/http` xoá deadline khi hijack nên `ReadTimeout` 30 giây không cắt WS.
- **Bảo mật:**
  - Cookie HttpOnly, SameSite=Lax, Secure theo https.
  - `safeNext` chặn `//`, `://` và path ngoài `/seller`.
  - SQL đều tham số hoá.
  - Không có `dangerouslySetInnerHTML`.
  - SĐT không có trong `PublicView`, export, payload tin cho người bán, hay log (GORM `ParameterizedQueries`, logger không log query string).
  - `/internal` bị chặn ở cả Caddy lẫn nginx và còn cần Bearer token so constant-time.
  - Caddy ghi đè XFF nên `ClientIP` đúng IP thật.
- **Web realtime:**
  - `SocketController` dọn hết timer và listener khi `stop`.
  - Socket cũ bị bỏ qua nhờ so `this.ws === ws`.
  - Chuông không kêu trùng khi resync (chỉ kêu khi `!prev`).
- **WebKit:** `Date.parse` với timestamp micro giây chạy đúng (đã chạy thực tế).

## Hành động đề xuất (theo thứ tự)

1. H1 và M1: sửa con trỏ resync (phân trang hoặc `has_more`, cộng biên an toàn). Thêm test: hơn 300 đơn đổi, và đơn commit sau `server_time`.
2. M2: retry tải lần đầu của bảng đơn.
3. M3 và M4: chốt ngữ nghĩa cảnh báo và hạn của outbox với chủ sản phẩm, rồi sửa `Status`/`Claim`/`PurgeRecipients`.
4. M6: bắt buộc `ACME_EMAIL` hoặc bỏ khối `email`.
5. M5, rồi các mục Low.

## Số liệu

- `go vet`: 0 issue. `go test ./...` (unit): xanh.
- Phần còn lại dùng số liệu đã kiểm chứng sẵn: golangci-lint 0, vitest 90/90, `tsc -b` và eslint sạch, Playwright 10 spec trên Chromium và WebKit.
- Độ phủ test: không đo.

## Câu hỏi còn mở

1. Banner đỏ có được bật bởi tin gửi **khách** thất bại không? Phase-05 nói có, PRD P0-11 ngầm nói không (M3).
2. Hạn tối đa của một tin outbox là bao lâu thì bỏ (M4)? Notifier có cam kết ack `ok:false` cho lỗi "khách chặn tin" hay sẽ ack `ok:true` để bỏ qua?
3. Màn người bán ở quầy có được tải lại định kỳ (ví dụ mỗi sáng) không? Câu trả lời đổi mức ưu tiên của H1, dù vẫn nên sửa.
4. CI job `secrets` (gitleaks) chưa chạy được ở máy này. Các giá trị e2e trong `infra/docker-compose.yml` (`SESSION_SECRET`, `NOTIFIER_TOKEN`, hash MD5) có thể bị rule `generic-api-key` bắt. Nên chạy thử hoặc thêm `.gitleaks.toml` allowlist cho file này.
