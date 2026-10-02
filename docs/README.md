# Gọi nước tại bàn — tài liệu kỹ thuật

Khách quét mã QR trên bàn, đặt nước trên web; người bán nhận và xử lý đơn trên màn web có chuông; hoa hồng theo quán được tính tự động. Yêu cầu sản phẩm: [`prd.md`](../prd.md). Quyết định kiến trúc: [`plans/261001-0655-qr-table-ordering-mvp/architecture.md`](../plans/261001-0655-qr-table-ordering-mvp/architecture.md).

| Tài liệu | Nội dung |
|----------|----------|
| [api.md](./api.md) | Hợp đồng REST, WebSocket, API nội bộ cho notifier Zalo |
| [runbook.md](./runbook.md) | Deploy, sao lưu, mật khẩu, xoay khoá, sự cố |
| [acceptance-p0.md](./acceptance-p0.md) | Đối chiếu từng tiêu chí P0 với test tự động hoặc bước kiểm tay |

## Cấu trúc

```text
apps/api/   Go 1.25, Gin, GORM, golang-migrate, coder/websocket
  cmd/api/              main: serve | migrate up|down|version | seed | healthcheck
  internal/app/         nơi duy nhất lắp route và nối phụ thuộc
  internal/platform/    config, db (+ testdb), httpx, middleware, clock, realtime (hub WS), ids, apperr
  internal/features/    auth, settings, partners, products, qrcodes, menu, orders, notifications, payments, reports
  migrations/           SQL, nhúng vào binary
apps/web/   React 19, Vite 7, Tailwind 4, shadcn/ui, React Router 7, TanStack Query
  src/app/              router, layout người bán
  src/features/         customer-menu, customer-order, seller-auth, seller-orders, admin-*
  src/shared/           api client, realtime (WebSocket + fallback polling), ui, lib
  e2e/                  Playwright
infra/      docker-compose.yml (dev, profile full cho E2E), docker-compose.prod.yml, caddy/
```

Mỗi feature API có `handler.go` (Gin) → `service.go` (nghiệp vụ, không biết Gin) → repository/SQL. Mọi ghi vào bảng `orders` đi qua `orders.Writer`.

## Chạy dev

Cần: Go 1.25+, Node 22+, pnpm 10, Docker.

```sh
cp apps/api/.env.example apps/api/.env   # sửa SELLER_PASSWORD_HASH, SESSION_SECRET, NOTIFIER_TOKEN
cp apps/web/.env.example apps/web/.env
(cd apps/web && pnpm install)
make dev        # Postgres (docker) + migrate + API :8080 + web :5173 (proxy /api, /ws)
make seed       # Quán test, bàn DEVTEST001..003 (menu mặc định có từ migrate-up) → http://localhost:5173/t/DEVTEST001
```

- `make dev` không hot reload Go: đổi code API thì Ctrl-C rồi chạy lại, hoặc `make dev-api` ở terminal riêng.
- Cổng 8080/5173/5432 bị chiếm thì `make dev` dừng và in tiến trình đang giữ cổng; không tự đổi cổng.
- Màn người bán: `http://localhost:5173/seller` (mật khẩu ứng với `SELLER_PASSWORD_HASH`).
- Không chạy API: `VITE_USE_MOCK=1 pnpm dev` trong `apps/web` dùng MSW giả lập API (chạy `pnpm exec msw init public` một lần).

## Lệnh

| Lệnh | Việc |
|------|------|
| `make test` | Go unit (+ integration khi có `TEST_DATABASE_URL`) và vitest |
| `make lint` | `go vet`, golangci-lint, eslint, tsc |
| `make size` | Build web và kiểm route khách ≤ 120 KB gzip JS |
| `make e2e` | Dựng stack container (profile `full`) + seed + Playwright (Chromium, WebKit) |
| `make build` | Build image `sidecup-api`, `sidecup-web` |
| `make migrate-up` / `migrate-down` / `seed` | Trên DB trong `apps/api/.env` |

Integration test Go cần Postgres: mỗi package tự tạo database riêng từ `TEST_DATABASE_URL` (ví dụ `postgres://sidecup:sidecup@localhost:5432/sidecup_test?sslmode=disable`).

E2E chạy được với stack bất kỳ: `E2E_BASE_URL` (mặc định `http://localhost:5173`), `E2E_SELLER_PASSWORD`, `E2E_DATABASE_URL` (để `psql` lùi tuổi đơn trong spec "quá 60 giây").
