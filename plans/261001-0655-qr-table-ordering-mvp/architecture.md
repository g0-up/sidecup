# Kiến trúc & hợp đồng dùng chung

Tài liệu này là nguồn tham chiếu chung cho mọi phase: cấu trúc monorepo, mô hình dữ liệu, hợp đồng API, quy tắc trạng thái. Phase nào thay đổi hợp đồng thì phải sửa ở đây trước, rồi mới sửa ở phase.

## 1. Quyết định kiến trúc (trade-off)

| # | Quyết định | Lựa chọn | Thay thế đã cân nhắc | Vì sao | Chi phí đổi hướng |
|---|-----------|----------|----------------------|--------|-------------------|
| A1 | Cập nhật thời gian thực | **WebSocket hai phía** qua hub in-process (`platform/realtime`, thư viện `github.com/coder/websocket`): màn người bán nhận mọi thay đổi đơn, cài đặt, trạng thái notifier; trang khách nhận trạng thái đơn và thay đổi menu. **REST polling 15s là fallback** khi WS không nối được (webview Zalo, proxy) và client luôn resync bằng `updated_after` khi reconnect | Polling thuần (đề xuất ban đầu); SSE | User chốt WebSocket ở phiên validation 01/10/2026. Hub một tiến trình bằng Go channel, publish **sau khi commit** transaction; không cần Redis vì một instance. | Trung bình: > 1 instance cần pub/sub qua Postgres `LISTEN/NOTIFY` hoặc Redis; client không đổi. |
| A2 | Hình dạng web | **Một app Vite**, hai cây route (`/t`, `/o` cho khách; `/seller/*` cho người bán), lazy chunk theo route, ngân sách ≤ 120 KB gzip JS cho route khách | Hai app Vite riêng; SSR như PRD gợi ý | User chốt React + shadcn + Vite. Một app giảm cấu hình lặp; ngân sách bundle + lazy chunk giữ mục tiêu ≤ 2s trên 4G yếu. Route khách chỉ dùng shadcn primitives tối thiểu (Button, Sheet, Input). | Trung bình: tách app nếu bundle vượt ngân sách sau khi đo. |
| A3 | Gửi tin Zalo | **Outbox table** + API nội bộ kiểu pull (`/internal/notifications/*`) cho dịch vụ notifier (ngoài phạm vi plan này) | API gọi webhook sang notifier | Notifier có thể chết/khởi động lại; pull + ack cho retry tự nhiên, không cần notifier mở cổng vào. Chuyển sang Zalo OA sau chỉ thay notifier. | Thấp. |
| A4 | Xác thực người bán | **Một mật khẩu**, env `SELLER_PASSWORD_HASH` là **MD5 hex** của mật khẩu (user chốt ở phiên validation 01/10/2026); cookie phiên **stateless** ký HMAC-SHA256, hết hạn 30 ngày, HttpOnly + Secure + SameSite=Lax | bcrypt (đề xuất ban đầu); bảng `sessions`; nhiều user + role | PRD: đúng một người bán. Đổi `SESSION_SECRET` là thu hồi toàn bộ phiên. P2-3 (nhiều người bán) thêm bảng `users` sau, không đụng bảng đơn. **Lưu ý đã ghi nhận:** MD5 không phải hàm băm mật khẩu (crack offline rất nhanh nếu env rò rỉ). Giảm thiểu: rate limit 5 lần/phút/IP, mật khẩu ≥ 16 ký tự ngẫu nhiên, hàm `auth.VerifyPassword` tách riêng để đổi sang bcrypt bằng một thay đổi tại một chỗ. | Thấp. |
| A5 | Chống ghi đè khi hai người bấm cùng lúc | **Conditional UPDATE** `WHERE id=? AND status=?expected` + `RETURNING`; 0 row → 409 kèm trạng thái hiện tại | `SELECT ... FOR UPDATE` trong transaction | Một câu lệnh, không giữ lock, đúng ngữ nghĩa "người sau thấy đơn đã đổi". | Không cần đổi. |
| A6 | Chống trùng đơn | `orders.idempotency_key UNIQUE`; `INSERT ... ON CONFLICT (idempotency_key) DO NOTHING` rồi SELECT lại; client sinh UUID khi bắt đầu bấm "Đặt nước", giữ trong `sessionStorage` tới khi nhận 2xx | Khoá theo client_id + hash giỏ | Đơn giản, đúng P0-4; key gắn với ý định đặt, không gắn nội dung giỏ (khách đặt hai đơn giống nhau là hợp lệ). | Không cần đổi. |
| A7 | Ảnh mã QR để in | **Render ở web** bằng `qrcode.react`, thẻ in HTML có tên quán + số bàn, tải PNG qua canvas | Server tạo PNG kèm chữ (cần font rendering) | API chỉ cần trả URL; không kéo thêm thư viện font vào Go. | Thấp. |
| A8 | VietQR | **API tạo chuỗi EMVCo** (hàm thuần, test với vector đã biết); web chỉ render QR | Dùng dịch vụ ảnh vietqr.io | Không phụ thuộc bên thứ ba, không rò số tài khoản ra ngoài. | Thấp. |
| A9 | Migration & ORM | **golang-migrate** với file SQL; GORM cho đọc/ghi thường, **không AutoMigrate**; đường ghi quan trọng (idempotent insert, conditional update, aggregate báo cáo) dùng SQL tường minh qua `db.Raw/Exec` | GORM AutoMigrate | Schema là hợp đồng; partial index và CHECK không biểu diễn được bằng AutoMigrate. Schema chỉ gồm bảng, CHECK, UNIQUE, FK, DEFAULT, index; **không có trigger hay function PL/pgSQL** (A14). | Không cần đổi. |
| A10 | Tiền và tỷ lệ | `BIGINT` VND; `commission_rate NUMERIC(5,4)`; hoa hồng = `ROUND(total * rate)` lưu vào `orders.commission_amount` lúc `paid` | Số thập phân cho tiền | VND không có xu; lưu số đã tính để báo cáo chỉ cộng, không tính lại. | Không cần đổi. |
| A11 | Tác vụ định kỳ | Goroutine ticker trong tiến trình API (tự huỷ đơn `sent` > 5 phút mỗi 15s; xoá SĐT > 90 ngày mỗi ngày) | cron container riêng | Một máy chủ, một instance. Nếu chạy > 1 instance: bọc bằng `pg_advisory_lock`. | Thấp. |
| A12 | Danh tính thiết bị | `client_id` UUID do web sinh, lưu `localStorage` (fallback cookie), gửi qua header `X-Client-Id`; dùng cho page view, rate limit, nhớ đơn đang chạy | Fingerprint | Không phải PII, đủ cho phễu G4 và P0-7. | Không cần đổi. |
| A13 | Múi giờ | Mọi cột thời gian `timestamptz`; "ngày" của page view, giờ bán, báo cáo tính theo `Asia/Ho_Chi_Minh` ở phía API (`APP_TZ`) | Lưu local time | Tránh lệch ngày khi VPS đặt UTC. | Không cần đổi. |
| A14 | Ràng buộc nghiệp vụ | **Tầng ứng dụng, không trigger** (user chốt 01/10/2026). Bất biến đơn `paid` và `updated_at` do Go thực thi: mọi ghi vào `orders` đi qua `orders.Writer` (phase 2) — không có phương thức DELETE, mọi UPDATE kèm `WHERE status = $from` với `$from ≠ 'paid'`, xoá SĐT là phương thức riêng chỉ set `customer_phone`. Hook GORM `BeforeCreate/BeforeUpdate/BeforeDelete` trên `Order` trả lỗi để chặn đường ORM ngoài Writer. `updated_at`: GORM `autoUpdateTime` cho CRUD, raw SQL set tường minh | Trigger `orders_paid_immutable` + `set_updated_at` (đề xuất ban đầu) | Logic một ngôn ngữ, test bằng Go, debug không phải đọc PL/pgSQL, không có hành vi ẩn ở DB. **Đổi lại là mất chốt chặn cuối ở DB**: UPDATE tay qua `psql` không bị chặn → runbook cấm sửa tay bảng `orders`, mọi điều chỉnh tiền đi qua `adjustments`, `order_events` là dấu vết kiểm toán. | Thấp: thêm lại trigger chỉ là một migration, không đụng code. |

Giả định chịu tải (plan hỏng nếu sai):

- **WebSocket đi qua được** webview Zalo và mạng 4G của khách. Dấu hiệu vỡ: log client `ws_fallback` tăng, trang khách cập nhật chậm ~15s. Phản ứng: fallback polling đã có; nếu > 30% phiên khách fallback thì hạ polling fallback xuống 5s (một hằng số).
- Chỉ **một instance API** chạy cùng lúc (A1 hub, A5, A11 dựa vào đây). Dấu hiệu vỡ: thấy hai bản ghi `order_events` system-cancel cho cùng đơn. Phản ứng: thêm advisory lock, không đổi schema.
- **Trình duyệt nhúng Zalo** cho phép `localStorage` và `fetch` bình thường. Dấu hiệu vỡ: `client_id` đổi mỗi lần mở. Phản ứng: fallback cookie đã có trong A12; nếu cookie cũng bị chặn thì bỏ tính năng "nhớ đơn", phễu G4 vẫn đếm theo request.
- Bundle route khách ≤ 120 KB gzip với shadcn + Tailwind v4. Dấu hiệu vỡ: `vite build` report vượt ngân sách. Phản ứng: tách app khách (A2).

## 2. Cấu trúc monorepo

```text
sidecup/
├── apps/
│   ├── api/                                  # Go 1.23+, Gin, GORM, golang-migrate
│   │   ├── cmd/api/main.go                   # wiring, graceful shutdown
│   │   ├── internal/
│   │   │   ├── app/router.go                 # lắp route của mọi feature
│   │   │   ├── platform/
│   │   │   │   ├── config/                   # env → struct, validate
│   │   │   │   ├── db/                       # gorm open, migrate runner, tx helper
│   │   │   │   ├── httpx/                    # error envelope, JSON helpers, validator
│   │   │   │   ├── middleware/               # request id, logger, recover, rate limit, client id, auth
│   │   │   │   ├── clock/                    # Clock interface (test được), tz
│   │   │   │   ├── realtime/                 # WebSocket hub: topic, subscribe, publish, conn lifecycle
│   │   │   │   └── ids/                      # token/code sinh ngẫu nhiên
│   │   │   └── features/
│   │   │       ├── auth/                     # login/logout/me, session cookie
│   │   │       ├── settings/                 # accepting_orders, eta, bank info
│   │   │       ├── partners/                 # quán, giờ bán, hoa hồng, món ẩn
│   │   │       ├── products/                 # món, bật/tắt
│   │   │       ├── qrcodes/                  # tạo/thu hồi token theo bàn
│   │   │       ├── menu/                     # GET /api/t/{token}, page views
│   │   │       ├── orders/                   # tạo, xem, huỷ, chuyển trạng thái, state machine, scheduler
│   │   │       ├── notifications/            # outbox + API nội bộ cho notifier + heartbeat
│   │   │       ├── payments/                 # vietqr payload
│   │   │       └── reports/                  # hoa hồng, phễu, điều chỉnh, export
│   │   ├── migrations/                       # 000001_init.up.sql / .down.sql ...
│   │   ├── Dockerfile
│   │   ├── go.mod
│   │   └── Makefile
│   └── web/                                  # React 19, TypeScript, Vite, Tailwind v4, shadcn/ui
│       ├── src/
│       │   ├── app/                          # router.tsx, providers.tsx, routes/customer.tsx, routes/seller.tsx
│       │   ├── features/
│       │   │   ├── customer-menu/            # /t/:token
│       │   │   ├── customer-order/           # /o/:id
│       │   │   ├── seller-auth/              # /seller/login
│       │   │   ├── seller-orders/            # /seller, /seller/orders/:id
│       │   │   ├── admin-products/
│       │   │   ├── admin-partners/           # kèm bàn + QR
│       │   │   ├── admin-settings/
│       │   │   └── admin-reports/
│       │   ├── shared/
│       │   │   ├── api/                      # fetch client, error type, client-id
│       │   │   ├── ui/                       # shadcn components (generated)
│       │   │   ├── realtime/                 # useSocket (connect, reconnect, fallback polling), message types
│       │   │   ├── hooks/                    # usePolling (fallback), useLocalStorage
│       │   │   └── lib/                      # money format, phone validate, time
│       │   └── main.tsx
│       ├── Dockerfile, nginx.conf
│       ├── components.json, vite.config.ts, package.json
│       └── e2e/                              # Playwright (phase 9)
├── infra/
│   ├── docker-compose.yml                    # dev: postgres (+ api/web profile)
│   ├── docker-compose.prod.yml               # postgres + api + web(nginx) + caddy
│   └── caddy/Caddyfile
├── docs/                                     # README kỹ thuật, api.md, runbook
├── plans/
├── Makefile                                  # make dev / migrate / test / build
└── prd.md
```

Quy ước feature phía API: mỗi thư mục có `handler.go` (Gin handlers + `RegisterRoutes`), `service.go` (nghiệp vụ, không biết Gin), `repository.go` (GORM/SQL), `model.go` (struct GORM), `dto.go` (request/response), `*_test.go`. Feature được import `platform/*`, `model.go`/type thuần của feature khác (ví dụ `menu` dùng `partners.OpenHours`), và service của feature khác qua interface nhỏ khai báo tại nơi dùng; không import handler của feature khác.

Quy ước feature phía web: mỗi thư mục có `api.ts` (hàm gọi API + type), `components/`, `hooks/`, `page.tsx`, `*.test.ts(x)`. Chỉ `shared/` được import chéo.

## 3. Mô hình dữ liệu (PostgreSQL 16)

```sql
partners (
  id uuid pk default gen_random_uuid(), name text not null,
  commission_rate numeric(5,4) not null default 0.1500 check (commission_rate between 0 and 1),
  payout_period text not null default 'week' check (payout_period in ('week','month')),
  open_hours jsonb not null default '[{"days":[1,2,3,4,5,6,7],"from":"00:00","to":"23:59"}]'
    check (jsonb_typeof(open_hours) = 'array'),   -- nhiều khung giờ theo thứ; days: 1=Thứ Hai … 7=Chủ Nhật (ISO)
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
)
partner_hidden_products (partner_id uuid fk, product_id uuid fk, pk(partner_id, product_id))
products (
  id uuid pk, name text not null, price bigint not null check (price >= 0), image_url text,
  has_sweet boolean not null default true, has_ice boolean not null default true,
  available boolean not null default true, sort int not null default 0,
  created_at, updated_at
)
qr_codes (
  token text pk check (length(token) >= 8), partner_id uuid fk not null, table_label text not null,
  active boolean not null default true, created_at timestamptz, revoked_at timestamptz
)
orders (
  id uuid pk, code text not null unique,
  qr_token text not null, partner_id uuid not null, partner_name text not null, table_label text not null,   -- ghi cứng lúc tạo
  items jsonb not null,                       -- [{product_id,name,unit_price,qty,sweet,ice,line_total}]
  note text check (length(note) <= 200), total bigint not null,
  discount_total bigint not null default 0,  -- luôn 0 ở bản đầu; chỗ sẵn cho P2-4, không cần migrate dữ liệu sau
  status text not null check (status in ('sent','accepted','delivering','paid','rejected','cancelled','failed')),
  cancel_reason text, payment_method text check (payment_method in ('cash','transfer')),
  commission_rate numeric(5,4), commission_amount bigint,           -- set khi paid
  customer_phone text, client_id text not null, idempotency_key text not null unique,
  created_at, accepted_at, delivering_at, paid_at, closed_at, updated_at
)
order_events (id bigserial pk, order_id uuid fk, from_status text, to_status text not null,
              actor text not null check (actor in ('customer','seller','system')), reason text, at timestamptz)
adjustments (id uuid pk, partner_id uuid fk, order_id uuid null fk, amount bigint not null, reason text not null,
             created_by text not null, created_at timestamptz)
page_views (qr_token text, day date, client_id text, first_seen_at timestamptz, pk(qr_token, day, client_id))
settings (id smallint pk check (id = 1), accepting_orders boolean default true, eta_minutes int default 7,
          bank_bin text, bank_account text, bank_account_name text, updated_at)
notification_outbox (id bigserial pk, kind text check (kind in ('seller_new_order','customer_status')),
                     order_id uuid fk, recipient text not null, payload jsonb not null,
                     status text default 'pending' check (status in ('pending','sent','failed')),
                     attempts int default 0, last_error text, next_attempt_at timestamptz, created_at, sent_at)
notifier_heartbeat (id smallint pk check (id = 1), last_seen_at timestamptz, session_ok boolean, message text)
```

Index: `orders(status, created_at)`, `orders(partner_id, paid_at) where status='paid'`, `orders(client_id, created_at desc)`, `orders(updated_at)`, `order_events(order_id, at)`, `notification_outbox(status, next_attempt_at) where status='pending'`, `page_views(day)`, `qr_codes(partner_id)`.

Không có trigger hay function nào trong schema (A14).

Bất biến đơn `paid` (P0-9) thực thi ở tầng ứng dụng: `orders.Writer` là đường ghi duy nhất vào `orders`, không có DELETE, mọi UPDATE có `WHERE status = $from` với `$from` khác `paid` (đơn `paid` không bao giờ khớp điều kiện), riêng xoá SĐT sau 90 ngày dùng `ClearCustomerPhone` chỉ set `customer_phone` và `updated_at`. Hook GORM trên `Order` chặn mọi `Create/Save/Updates/Delete` qua ORM. Quy ước review: chỉ `orders/writer.go` được chứa `INSERT INTO orders` / `UPDATE orders`.

`updated_at`: cột `default now()` lo INSERT; UPDATE qua GORM dựa vào `autoUpdateTime` trên field `UpdatedAt`; UPDATE bằng raw SQL phải set `updated_at = now()` tường minh (test khớp schema ở phase 2 kiểm field có tag).

## 4. Máy trạng thái đơn

| Từ | Tới | Ai | Ghi gì |
|----|-----|----|--------|
| — | `sent` | customer | `created_at` |
| `sent` | `accepted` | seller | `accepted_at` |
| `sent` | `rejected` | seller | `closed_at`, `cancel_reason` |
| `sent` | `cancelled` | customer (lý do `customer`) hoặc system (lý do `timeout`, sau 5 phút) | `closed_at`, `cancel_reason` |
| `accepted` | `delivering` | seller | `delivering_at` |
| `delivering` | `paid` | seller, kèm `payment_method` bắt buộc | `paid_at`, `closed_at`, `commission_rate` (copy từ partner lúc đó), `commission_amount` |
| `delivering` | `failed` | seller | `closed_at`, `cancel_reason = 'customer_not_found'` |

Mọi chuyển trạng thái: một transaction gồm conditional UPDATE + INSERT `order_events` + INSERT `notification_outbox` (khi tới `accepted`, `delivering`, `paid`, `rejected`, `cancelled` do timeout). Chuyển không hợp lệ → `409 {code:"INVALID_TRANSITION", current_status}`.

## 5. Hợp đồng API

Mọi lỗi dùng envelope `{ "error": { "code": "STRING_CODE", "message": "câu tiếng Việt cho người dùng", "details": {...} } }`. Mọi response JSON có `server_time` khi client cần đồng bộ đồng hồ (list đơn, trạng thái đơn).

**Khách (public, header `X-Client-Id` bắt buộc)**

| Method | Path | Ghi chú |
|--------|------|---------|
| GET | `/api/t/{token}` | Menu đã lọc món ẩn; `{partner:{name}, table_label, eta_minutes, ordering:{enabled, reason: null\|"paused"\|"closed"}, products:[{id,name,price,image_url,has_sweet,has_ice,available}], my_orders:[{id,code,status}]}`. Ghi page view (dedupe theo ngày + client). `410 QR_REVOKED`, `404 QR_NOT_FOUND`. |
| POST | `/api/t/{token}/orders` | Header `Idempotency-Key` (UUID, bắt buộc). Body `{items:[{product_id, qty, sweet?, ice?}], note?, phone}`. `201` tạo mới, `200` trả lại đơn đã có cùng key. `422 VALIDATION` (phone, qty 1..20, note ≤ 200, sweet/ice chỉ khi món hỗ trợ). `409` với code `QR_REVOKED`, `PAUSED`, `OUTSIDE_HOURS`, `PRODUCT_UNAVAILABLE {product_ids}`. Server tự tính giá và gộp dòng. Rate limit 10 req/phút theo client_id. |
| GET | `/api/orders/{id}` | `{id, code, status, items, total, partner_name, table_label, timestamps, server_time}`; không trả `customer_phone`. |
| POST | `/api/orders/{id}/cancel` | Chỉ khi `sent` và `X-Client-Id` khớp `orders.client_id`; ngược lại `409`/`403`. |

**Người bán (cookie phiên; `401 UNAUTHENTICATED`)**

| Method | Path | Ghi chú |
|--------|------|---------|
| POST | `/api/seller/login` | `{password}` → set cookie `sc_session`. Rate limit 5/phút theo IP. |
| POST | `/api/seller/logout` ; GET `/api/seller/me` | |
| GET | `/api/seller/orders?scope=open\|closed&updated_after=<rfc3339>` | `open` = sent/accepted/delivering. Kèm `customer_phone`. Trả `server_time`. |
| GET | `/api/seller/orders/{id}` | |
| POST | `/api/seller/orders/{id}/transition` | `{to, expected_from, payment_method?, reason?}` → `200 order` hoặc `409 INVALID_TRANSITION {current_status}`. |
| GET | `/api/seller/orders/{id}/vietqr` | `{payload, amount, purpose}`; `409` nếu thiếu cấu hình ngân hàng. |
| GET/PUT | `/api/seller/settings` | `accepting_orders`, `eta_minutes`, bank_*. |
| GET/POST/PUT | `/api/seller/partners`, `/api/seller/partners/{id}` | kèm `hidden_product_ids`. |
| GET/POST/PUT | `/api/seller/products`, `/api/seller/products/{id}` ; PATCH `/{id}/availability` | |
| GET/POST | `/api/seller/partners/{id}/qrcodes` ; POST `/api/seller/qrcodes/{token}/revoke` | POST trả `{token, url}`. |
| GET | `/api/seller/reports/commission?partner_id?&from&to` hoặc `&period=current\|previous` | Theo quán + tổng: `paid_count, revenue, failed_count, commission, adjustments_total, net`. |
| GET | `/api/seller/reports/commission/export?partner_id&from&to` | `text/plain; charset=utf-8`, không chứa SĐT. |
| GET | `/api/seller/reports/funnel?from&to` | Theo quán, theo ngày: `views (distinct client), orders, paid`. |
| GET/POST | `/api/seller/adjustments` | |
| GET | `/api/seller/notifier/status` | `{healthy, last_seen_at, session_ok, failed_last_hour}`. |

**Nội bộ cho notifier (header `Authorization: Bearer <NOTIFIER_TOKEN>`)**

| Method | Path | Ghi chú |
|--------|------|---------|
| GET | `/internal/notifications/pending?limit=20` | Khoá mềm: set `next_attempt_at = now()+60s` khi trả ra. |
| POST | `/internal/notifications/{id}/ack` | `{ok:true}` → `sent`; `{ok:false,error}` → `attempts+1`, backoff 30s·2^n; `attempts >= 3` → `failed`. |
| POST | `/internal/notifier/heartbeat` | `{session_ok, message?}` mỗi 30s. |

**WebSocket (A1)**

| Endpoint | Xác thực | Nhận được | Ghi chú |
|----------|----------|-----------|---------|
| `GET /ws/seller` | cookie phiên (same-origin) | `order.created {order}`, `order.updated {order}`, `settings.updated {settings}`, `notifier.status {status}` | Server ping 30s; client reconnect backoff 1s→30s và gọi `GET /api/seller/orders?updated_after=` để resync. |
| `GET /ws/customer?client_id=<uuid>&order=<id>&token=<qr>` | `client_id` phải khớp `orders.client_id` của `order`; `token` phải active | `order.updated {order}` (chỉ view public, không SĐT), `menu.updated {products:[{id,available}], ordering}` | Trang menu chỉ gửi `token`; trang trạng thái gửi cả hai. Fallback polling 15s khi không nối được. |

Bổ sung khi implement (01/10/2026, chi tiết ở `docs/api.md`): `ordering.reason` có thêm `inactive` (409 `PARTNER_INACTIVE`) và `ordering.hours_today`; `menu.updated` mang danh sách món đầy đủ, hoặc `{revoked: true}` khi mã vừa bị thu hồi; màn người bán resync bằng `scope=open` thay vì `updated_after`; tin outbox quá 30 phút hết hạn; chỉ tin báo người bán gửi lỗi mới bật cảnh báo đỏ.

Mọi message dạng `{type, data, server_time}`. Hub topic: `seller`, `order:{id}`, `menu:{token}`; `menu.updated` được publish tới mọi `menu:*` topic của quán khi món đổi `available`, món ẩn đổi, settings đổi (`accepting_orders`) hoặc partner đổi `open_hours/active`.

**Vận hành**: `GET /healthz` (process), `GET /readyz` (DB ping).

## 6. Route web

| Route | Feature | Chunk |
|-------|---------|-------|
| `/t/:token` | customer-menu | customer |
| `/o/:id` | customer-order | customer |
| `/revoked` | customer-menu | customer |
| `/seller/login` | seller-auth | seller |
| `/seller` | seller-orders (board) | seller |
| `/seller/orders/:id` | seller-orders (detail + VietQR) | seller |
| `/seller/products` | admin-products | seller |
| `/seller/partners`, `/seller/partners/:id` | admin-partners (quán, bàn, QR, in thẻ) | seller |
| `/seller/settings` | admin-settings | seller |
| `/seller/reports` | admin-reports | seller |

## 7. Biến môi trường API

`APP_ENV`, `HTTP_ADDR` (`:8080`), `DATABASE_URL`, `APP_TZ` (`Asia/Ho_Chi_Minh`), `PUBLIC_BASE_URL` (để tạo link QR và link đơn trong tin Zalo), `SELLER_PASSWORD_HASH`, `SESSION_SECRET` (≥ 32 byte), `NOTIFIER_TOKEN`, `CORS_ORIGINS` (chỉ dev), `LOG_LEVEL`, `MIGRATE_ON_START`. Không có giá trị thật nào trong repo; `.env.example` chỉ có placeholder.

Web (build-time, Vite): `VITE_SELLER_NAME` (tên người bán hiện ở chân trang khách và thẻ QR), `VITE_USE_MOCK` (chỉ dev).
