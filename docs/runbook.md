# Runbook vận hành

Một VPS chạy `infra/docker-compose.prod.yml`: Caddy (TLS tự động) → `web` (nginx tĩnh) và `api`; Postgres không mở cổng ra ngoài. Homelab sau Traefik và Cloudflare Tunnel thì xem [Triển khai homelab (Traefik)](#triển-khai-homelab-traefik). Tin trạng thái đơn cho khách được gửi qua Zalo bởi worker chạy ngay trong process `api` (mục [Zalo gửi tin cho khách](#zalo-gửi-tin-cho-khách)). Tin báo đơn mới cho người bán qua Zalo chưa làm; nếu sau này có dịch vụ notifier ngoài, nó gọi `http://api:8080/internal/*` trong mạng docker.

## Triển khai lần đầu

1. Trỏ DNS `A` của tên miền về VPS; mở cổng 80, 443.
2. Trên VPS: `git clone`, rồi `cp infra/.env.example infra/.env` và điền:
   - `DOMAIN`, `ACME_EMAIL`, `SELLER_NAME`.
   - `POSTGRES_PASSWORD`: `openssl rand -hex 24`.
   - `SESSION_SECRET`: `openssl rand -base64 48`.
   - `NOTIFIER_TOKEN`: `openssl rand -hex 32` (đưa cùng giá trị cho dịch vụ notifier).
   - `ZALO_CREDENTIAL_KEY` (không bắt buộc): `openssl rand -base64 48`. Bỏ trống thì không gửi tin Zalo cho khách; xem [Zalo gửi tin cho khách](#zalo-gửi-tin-cho-khách).
   - `R2_*` (không bắt buộc): kho ảnh món. Bỏ trống thì nút "Chọn ảnh" báo chưa cấu hình; xem [Kho ảnh món](#kho-ảnh-món-cloudflare-r2).
   - `SELLER_PASSWORD_HASH`: xem mục [Mật khẩu người bán](#mật-khẩu-người-bán).
   - `chmod 600 infra/.env`.
3. `make prod-up` (tương đương `docker compose -f infra/docker-compose.prod.yml --env-file infra/.env up -d --build`). API tự chạy migration khi khởi động (`MIGRATE_ON_START=true`, có advisory lock).
4. Kiểm tra:
   - `curl -fsS https://$DOMAIN/api/healthz` → `{"status":"ok"}`.
   - `curl -s -o /dev/null -w '%{http_code}' https://$DOMAIN/internal/notifications/pending` → `404`.
   - Mở `https://$DOMAIN/seller/login`, đăng nhập, tạo quán, món, bàn; quét thẻ QR bằng điện thoại.

API từ chối khởi động khi thiếu biến hoặc sai định dạng (hash không phải 32 hex, `SESSION_SECRET` < 32 byte, `NOTIFIER_TOKEN` < 16 ký tự, `ZALO_CREDENTIAL_KEY` có giá trị nhưng < 32 byte, `R2_*` đặt dở dang hoặc sai định dạng). Xem lỗi bằng `docker compose -f infra/docker-compose.prod.yml logs api`.

## Triển khai homelab (Traefik)

Thay cho Caddy trên VPS: ghép `infra/docker-compose.homelab.yml` **sau** file production. Caddy không chạy; Traefik định tuyến hai hostname lấy từ file env của stack (`DOMAIN`, `API_DOMAIN`). Ví dụ stack cũ:

| Hostname | Tới | Ghi chú |
|----------|-----|---------|
| `https://sidecup.cauchuyenlaptrinh.com` | `web` (nginx, cổng 80) | Link QR, link đơn trong tin Zalo. `/api/*`, `/ws/*` trả 404 ở Traefik; `/internal/*` trả 404 ở nginx. |
| `https://sidecup-api.cauchuyenlaptrinh.com` | `api:8080` | REST `/api/*`, WebSocket `/ws/*`. `/internal*` trả 404 ở Traefik. Traefik kiểm `/readyz`. |

- Bundle web được build với `VITE_API_ORIGIN=https://${API_DOMAIN}` nên gọi API và mở WebSocket ở hostname api. API đặt `PUBLIC_BASE_URL` là hostname web (cookie `Secure`, Origin hợp lệ của WebSocket) và `CORS_ORIGINS` chỉ cho hostname web, có credentials. Hai hostname phải cùng site (ví dụ cùng `cauchuyenlaptrinh.com`) để cookie phiên `SameSite=Lax` vẫn đi kèm.
- Không service nào map cổng ra máy host (overlay ép `ports: !reset []` cho `postgres`, `api`, `web`). `postgres` chỉ ở mạng riêng của stack, có alias `sidecup-postgres` để không trùng tên với stack khác trên mạng `homelab`. Router, service và middleware Traefik có tiền tố `sidecup-${CUSTOMER:-prod}` nên nhiều stack chạy chung một Traefik.
- Cùng bộ header bảo mật như Caddyfile; CSP `connect-src` mở cho `https://` và `wss://` của hostname api.

Chuẩn bị ngoài repo này (repo không tạo các thứ sau):

- Mạng docker ngoài tên `homelab`, dùng chung với Traefik.
- Traefik v3, provider docker `exposedByDefault=false`, `network: homelab`, entrypoint `web` (`:80`).
- Cloudflare Tunnel: cả hai hostname → `http://traefik:80`. TLS kết thúc ở Cloudflare; không cần bản ghi `A` hay mở cổng 80/443.
- Nên đặt `entryPoints.web.forwardedHeaders.trustedIPs` của Traefik là subnet mạng `homelab` (`docker network inspect homelab`). Thiếu nó, Traefik thay `X-Forwarded-For` bằng IP của cloudflared nên giới hạn đăng nhập 5 lần/phút/IP bị dùng chung cho mọi khách.

Các bước:

1. `cp infra/.env.example infra/.env`, điền như [Triển khai lần đầu](#triển-khai-lần-đầu), thêm `DOMAIN=sidecup.cauchuyenlaptrinh.com` và `API_DOMAIN=sidecup-api.cauchuyenlaptrinh.com`. File production vẫn bắt buộc `ACME_EMAIL` khi đọc cấu hình: giữ giá trị bất kỳ. `chmod 600 infra/.env`. Stack cho khách hàng mới thì xem [Nhiều khách hàng](#nhiều-khách-hàng-mỗi-khách-một-stack).
2. `make homelab-config` (kiểm tra cấu hình ghép, không in bí mật), rồi `make homelab-up`. Đổi hostname = sửa `DOMAIN`/`API_DOMAIN` rồi `make homelab-up` (origin API nhúng lúc build web).
3. Kiểm tra:
   - `docker compose -f infra/docker-compose.prod.yml -f infra/docker-compose.homelab.yml --env-file infra/.env ps` → `postgres`, `api`, `web` healthy, không có `caddy`, cột PORTS chỉ có cổng container (không có `0.0.0.0:`).
   - `curl -fsS https://sidecup-api.cauchuyenlaptrinh.com/api/healthz` → `{"status":"ok"}`.
   - `curl -s -o /dev/null -w '%{http_code}' https://sidecup-api.cauchuyenlaptrinh.com/internal/notifications/pending` → `404`.
   - Đăng nhập `https://sidecup.cauchuyenlaptrinh.com/seller/login`; màn người bán không hiện banner "Kết nối chậm" (WebSocket tới hostname api qua được Cloudflare và Traefik).

Cập nhật, lùi phiên bản, sao lưu, xem log: như các mục dưới, thay `make prod-up` bằng `make homelab-up` và thêm `-f infra/docker-compose.homelab.yml` sau `-f infra/docker-compose.prod.yml` trong lệnh `docker compose`. Luôn sao lưu trước `make homelab-up` khi bản mới có migration.

## Nhiều khách hàng (mỗi khách một stack)

Mỗi khách hàng (người bán) chạy một stack riêng: `api`, `web`, `postgres` và volume dữ liệu riêng, chung file compose và chung một Traefik. Không có dữ liệu dùng chung giữa các khách.

| Khách | File env | Project docker | Web | API |
|-------|----------|----------------|-----|-----|
| (stack cũ) | `infra/.env` | `sidecup-prod` | `sidecup.cauchuyenlaptrinh.com` | `sidecup-api.cauchuyenlaptrinh.com` |
| `tiendouong` | `infra/customers/tiendouong/.env` | `sidecup-tiendouong` | `tiendouong.sidecup.app` | `tiendouong-api.sidecup.app` |

- `CUSTOMER` trong file env đặt tên project `sidecup-<khách>` (container, mạng, volume `sidecup-<khách>_pgdata`) và tiền tố router Traefik. Hai file env trùng `CUSTOMER` thì stack sau **ghi đè** stack trước, kể cả volume DB; `make` từ chối chạy khi `CUSTOMER` trong file khác tên thư mục.
- File env nằm trong `.gitignore`, không commit. Mỗi khách có bí mật riêng (`POSTGRES_PASSWORD`, `SESSION_SECRET`, `NOTIFIER_TOKEN`, `ZALO_CREDENTIAL_KEY`, mật khẩu người bán) và tài khoản Zalo gửi tin riêng.
- Kho ảnh R2 có thể dùng chung bucket với `R2_FOLDER=<khách>/products`. Token R2 không giới hạn được theo thư mục, nên stack nào cũng ghi được ảnh của khách khác: chấp nhận khi một người vận hành mọi stack; tách bucket và token khi khách tự giữ khoá.
- Image web build riêng cho từng khách (tên người bán, origin API nhúng lúc build). Mỗi stack ~100–200 MB RAM lúc rảnh.

Thêm khách mới `<khách>` (chữ thường, số, gạch ngang):

1. `mkdir -p infra/customers/<khách> && cp infra/.env.example infra/customers/<khách>/.env && chmod 600 infra/customers/<khách>/.env`. Điền `CUSTOMER=<khách>`, `DOMAIN`, `API_DOMAIN` (cùng site), bí mật **mới** như [Triển khai lần đầu](#triển-khai-lần-đầu) và mục [Mật khẩu người bán](#mật-khẩu-người-bán). Không copy bí mật từ khách khác.
2. Cloudflare Zero Trust: thêm hai public hostname vào tunnel, cả hai → `http://traefik:80`.
3. `make homelab-config CUSTOMER=<khách>` rồi `make homelab-up CUSTOMER=<khách>`. API tự chạy migration trên DB trống.
4. Kiểm tra như [Triển khai homelab](#triển-khai-homelab-traefik) bước 3 với hostname của khách. Trước khi DNS/tunnel sẵn sàng, kiểm qua Traefik trên máy: `curl -H 'Host: <API_DOMAIN>' http://127.0.0.1/api/healthz`.

Vận hành từng khách: thêm `CUSTOMER=<khách>` vào mọi lệnh `make prod-*`/`homelab-*`, và dùng `--env-file infra/customers/<khách>/.env` thay `infra/.env` trong lệnh `docker compose` ở các mục dưới (cập nhật, sao lưu, xem log). Sao lưu từng khách ra file riêng, ví dụ `sidecup-<khách>-$(date +%F).dump`.

Cập nhật mọi khách: sao lưu DB của từng khách, rồi `make homelab-up-all` (lần lượt `homelab-up` cho mỗi thư mục trong `infra/customers/`, dừng ở khách đầu tiên lỗi). Stack cũ đọc `infra/.env` không nằm trong vòng lặp: chạy `make homelab-up` riêng.

## Bot tìm kiếm và thẻ chia sẻ

- nginx của web trả `/robots.txt` (cho phép tất cả, kèm `Sitemap:`) và `/sitemap.xml` (chỉ trang `/`), dùng hostname của request. Không `Disallow` `/t/` hay `/o/`, để bot đọc được header `X-Robots-Tag: noindex, nofollow` mà nginx gửi trên `/t/*`, `/o/*`, `/seller*` và `/revoked`. Trang chủ và `/assets/` không có header này. Kiểm: `curl -sI https://<DOMAIN>/t/<mã> | grep -i x-robots-tag`.
- `og:url`, `og:image` và `canonical` cần URL tuyệt đối nên lấy từ biến build `VITE_PUBLIC_ORIGIN`. Compose production đặt `https://${DOMAIN}`; bỏ trống (dev, E2E) thì không chèn các thẻ đó (kể cả kích thước và `og:image:alt`). Đổi hostname = build lại web.
- Ảnh chia sẻ `apps/web/public/og-image.png` (1200×630) vẽ từ token màu, không chứa tên người bán. Đổi màu hoặc chữ: sửa `apps/web/scripts/render-og-image.mjs`, chạy `node scripts/render-og-image.mjs` trong `apps/web` (cần Chromium của Playwright), commit cả script và ảnh. Zalo và Facebook giữ bản xem trước cũ trong cache một thời gian; repo không xoá được cache đó.

## Cập nhật phiên bản

```sh
git pull
make prod-up            # build lại image, migration chạy khi api khởi động
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env ps
```

Migration chỉ đi tới. **Cảnh báo:** `api migrate down` (và `make migrate-down` ở dev) lùi **toàn bộ** migration về 0, tức là xoá mọi bảng và dữ liệu — không có tham số số bước. Đừng dùng nó để lùi một phiên bản. Muốn lùi:

1. Sao lưu ngay (mục dưới).
2. Deploy lại bản code cũ.
3. Chạy tay file `apps/api/migrations/<số>_<tên>.down.sql` của **từng** migration mới hơn bản cũ, từ số lớn về nhỏ, rồi đặt lại phiên bản: `UPDATE schema_migrations SET version = <số của bản cũ>, dirty = false;`. Ví dụ lùi `000003_zalo_account`: `DROP TABLE IF EXISTS zalo_account;` rồi `version = 2`.
4. Nếu có gì sai, khôi phục từ bản sao lưu ở bước 1.

Trước khi cập nhật lên bản có migration mới (ví dụ `000003_zalo_account`), luôn sao lưu DB trước `make prod-up` vì API tự `migrate up` khi khởi động.

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

## Zalo gửi tin cho khách

Khi người bán đổi trạng thái đơn (Đang pha, Đang mang ra, Đã thu tiền, Quán từ chối, Huỷ do quá hạn), worker trong process `api` gửi tin Zalo tới khách có nhập SĐT, từ tài khoản Zalo cá nhân mà người bán kết nối trong **Cài đặt → Gửi trạng thái đơn qua Zalo**. Đây là cách không chính thức (PRD P0-5, rủi ro đã chấp nhận).

- **Khoá `ZALO_CREDENTIAL_KEY`**: mã hoá (AES-GCM) cookie/phiên Zalo lưu trong bảng `zalo_account`; credentials không bao giờ nằm trong log hay response. Tạo bằng `openssl rand -base64 48`, đặt trong `infra/.env`, `make prod-up`. Thiếu key thì API vẫn chạy, worker không gửi tin, thẻ Zalo hiện "Chưa cấu hình Zalo trên máy chủ".
- **Đổi key**: phiên đã lưu không giải mã được nữa → tài khoản chuyển `expired`, banner đỏ bật; người bán vào Cài đặt quét lại mã QR. Làm khi nghi lộ `infra/.env` hoặc bản sao lưu DB.
- **Tài khoản Zalo phụ**: dùng một tài khoản riêng để gửi tin, không phải Zalo chính của người bán. Nhắn cho người lạ dễ bị Zalo hạn chế hoặc khoá; mất tài khoản phụ thì không mất danh bạ, tin nhắn với khách quen.
- **Chỉ một replica `api`**: phiên Zalo và lần quét QR nằm trong bộ nhớ process; hai bản sao sẽ cùng gửi tin và tranh phiên.
- Mất mạng tới Zalo, Zalo trả 5xx/429 hay request quá hạn **không** làm tài khoản thành `expired`: tin được thử lại như lỗi gửi thường (tính vào 3 lượt thử). Chỉ khi Zalo thực sự từ chối phiên (đăng xuất, cookie hỏng) mới chuyển `expired` và bật banner.
- Gửi tin là *ít nhất một lần*: nếu Zalo đã nhận tin nhưng ack vào DB thất bại (DB rớt, tắt máy giữa chừng), tin được gửi lại sau khi hết lease 60 giây — khách có thể nhận trùng một tin.
- SĐT không có Zalo (hoặc chặn tìm bằng SĐT) → tin `failed` ngay với `last_error = không tìm thấy Zalo`, không thử lại, không bật banner. Lỗi khác thử lại tối đa 3 lần (30s, 60s).

### Khi banner "Phiên Zalo đã hết hạn"

Dấu hiệu: màn người bán hiện banner đỏ "Phiên Zalo đã hết hạn — khách không nhận được tin trạng thái đơn. Vào Cài đặt để quét lại mã QR." kèm link "Mở Cài đặt". Zalo đã đăng xuất tài khoản gửi tin (đăng nhập nơi khác, đổi mật khẩu, bị hạn chế) hoặc key đã đổi.

1. Đơn vẫn chạy bình thường; khách vẫn xem trạng thái trên trang web của đơn.
2. Người bán mở **Cài đặt** → thẻ Zalo hiện "Phiên hết hạn" → **Quét lại mã QR** bằng app Zalo trên điện thoại phụ → xác nhận đăng nhập.
3. Banner tắt trong vài giây. Tin chưa gửi còn trong hạn 30 phút được gửi tiếp (phiên hết hạn không làm tốn lượt thử); tin quá 30 phút bị đánh dấu `failed` với `last_error = expired`.
4. Nếu quét lại vẫn hỏng hoặc tài khoản bị khoá: **Ngắt kết nối** rồi kết nối một tài khoản phụ khác.

## Kho ảnh món (Cloudflare R2)

Nút "Chọn ảnh" trong **Thêm món / Sửa món** thu nhỏ ảnh trên trình duyệt (cạnh dài ≤ 1200 px, WebP hoặc JPEG) rồi gửi lên API; API lưu vào R2 và trả URL công khai để lưu vào `image_url`. Thiếu cấu hình thì API vẫn chạy, nút báo "Chưa cấu hình kho ảnh".

1. Cloudflare → R2 → tạo bucket. **Settings → Custom Domains**: gắn một hostname (ví dụ `img.example.vn`) để đọc công khai. `r2.dev` chỉ dùng để thử: bị giới hạn tốc độ.
2. R2 → **Manage API tokens** → tạo token quyền **Object Read & Write**, chỉ áp cho bucket đó. Ghi lại Access Key ID và Secret Access Key (chỉ hiện một lần); Account ID nằm ở trang tổng quan R2.
3. Điền vào `infra/.env` (không commit): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL=https://img.example.vn`, `R2_FOLDER=sidecup/products`. Đặt thiếu biến nào, `R2_ACCOUNT_ID` không phải 32 ký tự hex, URL không phải https, hoặc URL ảnh (gốc + thư mục + tên file) dài quá 500 ký tự thì `api` không khởi động và log nói rõ biến nào sai. `make prod-up` (homelab: `make homelab-up`) để khởi động lại `api`.
4. Kiểm tra: vào **Món** → **Thêm món** → chọn một ảnh từ điện thoại → **Lưu**. Mở URL ảnh trên trình duyệt (phải trả ảnh, không 404), rồi mở menu khách để thấy ảnh.

- Đổi `R2_FOLDER` chỉ áp cho ảnh tải lên sau đó; URL cũ vẫn chạy vì nằm nguyên trong bucket.
- Đổi hoặc xoá ảnh của món không xoá file cũ trong R2. Muốn dọn thì xoá tay trong bucket những file không còn món nào dùng.
- Lộ khoá: xoá token trong Cloudflare, tạo token mới, cập nhật `infra/.env`, khởi động lại `api`. Ảnh đã lưu không bị ảnh hưởng.
- Log `upload product image` (kèm `request_id`) chỉ ghi key và lỗi của R2, không ghi khoá. Tải ảnh báo "Không tải được ảnh lên" thường do token sai/hết hạn, bucket sai tên, hoặc R2 không trả lời trong 20 giây.

## Khi notifier Zalo chết

Dấu hiệu: màn người bán hiện banner đỏ "Zalo không gửi được tin — chỉ còn chuông báo trên màn này" (heartbeat quá 90 giây, hoặc có tin báo người bán `failed` trong 1 giờ). Heartbeat do worker trong `api` ghi mỗi 30 giây, nên quá 90 giây nghĩa là chính process `api` treo hoặc mất DB. Tin gửi khách lỗi (số không dùng Zalo, khách chặn người lạ) không bật banner, chỉ ghi `last_error`.

1. Đơn vẫn chạy bình thường; chuông trên màn người bán là kênh chính. Nhắc người bán để âm báo bật.
2. Kiểm tra `docker compose -f infra/docker-compose.prod.yml logs api` (log không chứa SĐT hay credentials).
3. Tin `pending` tự gửi lại khi worker sống lại, trừ tin quá 30 phút: chúng bị đánh dấu `failed` với `last_error = expired` để khách không nhận tin trạng thái cũ hàng giờ sau. Tin đã `failed` không gửi lại tự động; xem bằng:

   ```sql
   SELECT id, kind, status, attempts, last_error, created_at FROM notification_outbox
   WHERE status = 'failed' ORDER BY id DESC LIMIT 20;
   ```

   Muốn gửi lại một tin: `UPDATE notification_outbox SET status='pending', attempts=0, next_attempt_at=NULL WHERE id=…;` (bảng outbox được phép sửa tay, khác với `orders`).

## Khi WebSocket không qua được

Dấu hiệu: banner vàng "Kết nối chậm" trên màn người bán, log trình duyệt `ws_fallback`. Trang khách và màn người bán vẫn chạy bằng polling 15 giây. Kiểm tra Caddy còn route `/ws/*` tới `api:8080` với `read_timeout 0` (homelab: router `sidecup-api` của Traefik còn chạy, CSP của web có `wss://sidecup-api.cauchuyenlaptrinh.com`, Cloudflare Tunnel không chặn WebSocket). Nếu nhiều khách (> 30% phiên) rơi vào fallback, hạ `fallbackMs` trong `apps/web/src/shared/realtime/socket-controller.ts` xuống 5000.

## Tài khoản DB

Bản đầu dùng một role (`POSTGRES_USER`) cho cả migration và ứng dụng (giữ đơn giản). Khi cần tách quyền: tạo role `sidecup_app` chỉ có `SELECT, INSERT, UPDATE` trên các bảng (không `DELETE`, `TRUNCATE`, `DROP`), chạy migration bằng role owner qua `docker compose … run --rm api /api migrate up` với `DATABASE_URL` của owner, và đặt `MIGRATE_ON_START=false` cho service `api` dùng `sidecup_app`.

## Giả định chịu tải

Hệ thống giả định **một instance API** (hub WebSocket trong tiến trình, scheduler, rate limit trong bộ nhớ, phiên Zalo gửi tin cho khách). Không scale `api` lên nhiều bản sao khi chưa thêm pub/sub (Postgres `LISTEN/NOTIFY` hoặc Redis) và `pg_advisory_lock` cho scheduler.
