# Runbook vận hành

Một VPS chạy `infra/docker-compose.prod.yml`: Caddy (TLS tự động) → `web` (nginx tĩnh) và `api`; Postgres không mở cổng ra ngoài. Dịch vụ notifier Zalo nằm ngoài repo này, gọi `http://api:8080/internal/*` trong mạng docker.

## Triển khai lần đầu

1. Trỏ DNS `A` của tên miền về VPS; mở cổng 80, 443.
2. Trên VPS: `git clone`, rồi `cp infra/.env.example infra/.env` và điền:
   - `DOMAIN`, `ACME_EMAIL`, `SELLER_NAME`.
   - `POSTGRES_PASSWORD`: `openssl rand -hex 24`.
   - `SESSION_SECRET`: `openssl rand -base64 48`.
   - `NOTIFIER_TOKEN`: `openssl rand -hex 32` (đưa cùng giá trị cho dịch vụ notifier).
   - `SELLER_PASSWORD_HASH`: xem mục [Mật khẩu người bán](#mật-khẩu-người-bán).
   - `chmod 600 infra/.env`.
3. `make prod-up` (tương đương `docker compose -f infra/docker-compose.prod.yml --env-file infra/.env up -d --build`). API tự chạy migration khi khởi động (`MIGRATE_ON_START=true`, có advisory lock).
4. Kiểm tra:
   - `curl -fsS https://$DOMAIN/api/healthz` → `{"status":"ok"}`.
   - `curl -s -o /dev/null -w '%{http_code}' https://$DOMAIN/internal/notifications/pending` → `404`.
   - Mở `https://$DOMAIN/seller/login`, đăng nhập, tạo quán, món, bàn; quét thẻ QR bằng điện thoại.

API từ chối khởi động khi thiếu biến hoặc sai định dạng (hash không phải 32 hex, `SESSION_SECRET` < 32 byte, `NOTIFIER_TOKEN` < 16 ký tự). Xem lỗi bằng `docker compose -f infra/docker-compose.prod.yml logs api`.

## Cập nhật phiên bản

```sh
git pull
make prod-up            # build lại image, migration chạy khi api khởi động
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env ps
```

Migration chỉ đi tới. Muốn lùi: deploy lại bản code cũ **và** chạy `docker compose … exec api /api migrate down` cho đúng số bước — làm sau khi đã sao lưu (mục dưới).

## Sao lưu

PRD yêu cầu sao lưu hằng ngày ra ngoài VPS. Lệnh thủ công:

```sh
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env exec -T postgres \
  pg_dump -U sidecup -d sidecup --format=custom > "sidecup-$(date +%F).dump"
```

Đề xuất: cron 03:30 mỗi ngày chạy lệnh trên rồi đẩy file sang nơi khác (S3/Backblaze/máy nhà), giữ 30 bản. Khôi phục: `pg_restore --clean --if-exists -U sidecup -d sidecup < file.dump` khi `api` đã dừng. Luôn sao lưu trước mọi thao tác schema hoặc sửa dữ liệu hàng loạt.

## Mật khẩu người bán

`SELLER_PASSWORD_HASH` là **MD5 hex** của mật khẩu (quyết định sản phẩm, architecture A4). MD5 không phải hàm băm mật khẩu: nếu `infra/.env` rò rỉ, mật khẩu ngắn bị dò ra gần như ngay lập tức. Vì vậy:

- Mật khẩu phải **≥ 16 ký tự ngẫu nhiên**, không dùng lại ở nơi khác. Tạo: `openssl rand -base64 18`.
- Tạo hash (không để mật khẩu nằm trong lịch sử shell):

  ```sh
  read -rs PW && printf '%s' "$PW" | md5sum | cut -d' ' -f1; unset PW     # Linux
  read -rs PW && printf '%s' "$PW" | md5; unset PW                        # macOS
  ```

- Đổi mật khẩu: thay `SELLER_PASSWORD_HASH`, rồi `make prod-up`. Phiên đang mở vẫn còn hiệu lực tới khi đổi `SESSION_SECRET` (mục dưới).
- Đăng nhập bị giới hạn 5 lần/phút/IP.

**Chuyển sang bcrypt** (khuyến nghị khi có thời gian): thuật toán chỉ nằm ở `apps/api/internal/features/auth/password.go` (`VerifyPassword`). Đổi hàm đó sang `bcrypt.CompareHashAndPassword`, đổi kiểm tra định dạng `SELLER_PASSWORD_HASH` trong `apps/api/internal/platform/config/config.go` (chấp nhận chuỗi `$2a$`/`$2b$`), tạo hash mới bằng `htpasswd -bnBC 12 "" '<mật khẩu>' | tr -d ':\n'`, deploy.

## Xoay `SESSION_SECRET` (đăng xuất mọi máy)

Cookie phiên không lưu ở server; đổi `SESSION_SECRET` là thu hồi mọi phiên. Làm khi mất điện thoại/máy tính bảng đang đăng nhập hoặc nghi lộ cookie: sinh giá trị mới, sửa `infra/.env`, `make prod-up`, đăng nhập lại.

## Không sửa tay bảng `orders`

Database **không có trigger** (architecture A14). Bất biến "đơn `paid` không sửa, không xoá" và cột `updated_at` do ứng dụng thực thi: mọi ghi vào `orders` đi qua `orders.Writer` (`apps/api/internal/features/orders/writer.go`), mọi UPDATE kèm điều kiện trạng thái và không bao giờ khớp đơn `paid`. Một câu `UPDATE orders …` gõ tay trong `psql` **không bị chặn**, nên:

- Không `UPDATE`/`DELETE` bảng `orders`, `order_events` bằng tay ở production.
- Sai số tiền sau khi đã thu → tạo **điều chỉnh** (trang Báo cáo → Điều chỉnh, hoặc `POST /api/seller/adjustments`) với số âm/dương và lý do. Báo cáo hiện điều chỉnh riêng và trừ/cộng vào "Phải trả".
- `order_events` là dấu vết kiểm toán: mọi chuyển trạng thái có thời điểm và người bấm (`customer`, `seller`, `system`).
- Nếu cần chốt chặn ở DB, thêm một migration mới tạo trigger chặn `UPDATE/DELETE` khi `OLD.status = 'paid'` (ngoại lệ cột `customer_phone`, `updated_at`); không phải sửa code ứng dụng.

## Dữ liệu cá nhân

- SĐT khách chỉ lưu ở `orders.customer_phone` và `notification_outbox.recipient`. Mỗi ngày lúc 03:00 (giờ Việt Nam) scheduler xoá SĐT của đơn quá 90 ngày và của tin đã xử lý quá 90 ngày.
- SĐT không có trong view công khai, báo cáo, bản export cho chủ quán, log HTTP (logger không ghi body, cookie, header `Authorization`, và GORM không in giá trị tham số).

## Khi notifier Zalo chết

Dấu hiệu: màn người bán hiện banner đỏ "Zalo không gửi được tin — chỉ còn chuông báo trên màn này" (heartbeat quá 90 giây, `session_ok=false`, hoặc có tin báo người bán `failed` trong 1 giờ). Tin gửi khách lỗi (số không dùng Zalo, khách chặn người lạ) không bật banner, chỉ ghi `last_error`.

1. Đơn vẫn chạy bình thường; chuông trên màn người bán là kênh chính. Nhắc người bán để âm báo bật.
2. Kiểm tra dịch vụ notifier (log, phiên đăng nhập Zalo của tài khoản phụ). Đăng nhập lại Zalo nếu phiên hết hạn.
3. Tin `pending` tự gửi lại khi notifier sống lại, trừ tin quá 30 phút: chúng bị đánh dấu `failed` với `last_error = expired` để khách không nhận tin trạng thái cũ hàng giờ sau. Tin đã `failed` không gửi lại tự động; xem bằng:

   ```sql
   SELECT id, kind, status, attempts, last_error, created_at FROM notification_outbox
   WHERE status = 'failed' ORDER BY id DESC LIMIT 20;
   ```

   Muốn gửi lại một tin: `UPDATE notification_outbox SET status='pending', attempts=0, next_attempt_at=NULL WHERE id=…;` (bảng outbox được phép sửa tay, khác với `orders`).

## Khi WebSocket không qua được

Dấu hiệu: banner vàng "Kết nối chậm" trên màn người bán, log trình duyệt `ws_fallback`. Trang khách và màn người bán vẫn chạy bằng polling 15 giây. Kiểm tra Caddy còn route `/ws/*` tới `api:8080` với `read_timeout 0`. Nếu nhiều khách (> 30% phiên) rơi vào fallback, hạ `fallbackMs` trong `apps/web/src/shared/realtime/socket-controller.ts` xuống 5000.

## Tài khoản DB

Bản đầu dùng một role (`POSTGRES_USER`) cho cả migration và ứng dụng (giữ đơn giản). Khi cần tách quyền: tạo role `sidecup_app` chỉ có `SELECT, INSERT, UPDATE` trên các bảng (không `DELETE`, `TRUNCATE`, `DROP`), chạy migration bằng role owner qua `docker compose … run --rm api /api migrate up` với `DATABASE_URL` của owner, và đặt `MIGRATE_ON_START=false` cho service `api` dùng `sidecup_app`.

## Giả định chịu tải

Hệ thống giả định **một instance API** (hub WebSocket trong tiến trình, scheduler, rate limit trong bộ nhớ). Không scale `api` lên nhiều bản sao khi chưa thêm pub/sub (Postgres `LISTEN/NOTIFY` hoặc Redis) và `pg_advisory_lock` cho scheduler.
