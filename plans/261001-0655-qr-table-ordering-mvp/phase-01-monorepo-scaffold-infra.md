---
title: "Phase 1: Dựng monorepo và hạ tầng dev"
status: todo
priority: P1
effort: 0.5d
dependencies: []
---

# Phase 1: Dựng monorepo và hạ tầng dev

## Context Links

- [architecture.md §2 Cấu trúc monorepo](./architecture.md#2-cấu-trúc-monorepo), [§7 Biến môi trường](./architecture.md#7-biến-môi-trường-api)
- PRD: §Yêu cầu phi chức năng (một máy chủ, ít thành phần)

## Overview

Tạo khung `apps/api`, `apps/web`, `infra/`, công cụ chạy dev một lệnh, lint/test chạy được dù chưa có feature nào. Phase này không có nghiệp vụ; mục tiêu là mọi phase sau chỉ thêm file vào thư mục đã có.

## Key Insights

- Repo chưa có commit nào. Commit đầu tiên nên là khung này để các phase sau có diff sạch.
- Tailwind v4 + shadcn/ui dùng `@tailwindcss/vite`, không cần `postcss.config`. shadcn CLI `init` sinh `components.json` và `src/shared/ui`; alias `@/` trỏ `src/`.
- Go module path dùng `github.com/<owner>/sidecup/apps/api` hoặc ngắn hơn `sidecup/api`; chọn một và giữ nguyên.

## Requirements

- [ ] `make dev` chạy Postgres (docker), API (`go run ./cmd/api`; không dùng `air` hay hot reload, khởi động lại tay khi đổi code Go) và web (`vite`) cùng lúc; `make down` dừng.
- [x] `make migrate-up/down`, `make test`, `make lint`, `make build` hoạt động từ root.
- [x] Web dev server proxy `/api`, `/internal` và `/ws` (với `ws: true`) tới API (`vite.config.ts` → `server.proxy`), tránh CORS ở dev.
- [x] `.env.example` cho api và web; `.gitignore` chặn `.env*`, `node_modules`, `dist`, `bin`.
- [x] CI (GitHub Actions) chạy `go vet`, `golangci-lint`, `go test`, `pnpm lint`, `pnpm test`, `pnpm build` trên PR.

## Architecture

Hai app độc lập về toolchain (Go module riêng, package.json riêng), dùng chung root `Makefile` và `infra/docker-compose.yml`. Không dùng workspace monorepo tool (Turborepo/Nx) vì chỉ có một package JS.

## Related Code Files

Create:
- `Makefile`, `.gitignore`, `.editorconfig`, `README.md`
- `infra/docker-compose.yml` (service `postgres:16-alpine`, volume, healthcheck; profile `full` có `api`, `web`)
- `apps/api/go.mod`, `apps/api/cmd/api/main.go` (chỉ `/healthz`), `apps/api/Makefile`, `apps/api/.env.example`, `apps/api/.golangci.yml`, `apps/api/Dockerfile` (multi-stage, distroless)
- `apps/web/package.json`, `vite.config.ts`, `tsconfig.json`, `components.json`, `src/main.tsx`, `src/app/router.tsx` (route `/` placeholder), `src/index.css` (`@import "tailwindcss"`), `.env.example`, `Dockerfile` + `nginx.conf` (SPA fallback, proxy `/api` → `api:8080`), `.eslintrc`/`eslint.config.js`, `vitest.config.ts`
- `.github/workflows/ci.yml`

## Implementation Steps

1. Khởi tạo git baseline: `git add prd.md plans docs` chưa cần; tạo `.gitignore` trước.
2. API: `cd apps/api && go mod init sidecup/api`; thêm deps `github.com/gin-gonic/gin`, `gorm.io/gorm`, `gorm.io/driver/postgres`, `github.com/golang-migrate/migrate/v4` (+ `database/postgres`, `source/iofs`), `github.com/caarlos0/env/v11`, `golang.org/x/crypto`, `golang.org/x/time`, `github.com/google/uuid`, `github.com/stretchr/testify`. `main.go` khởi tạo Gin với `/healthz` trả `{status:"ok"}` và graceful shutdown (`signal.NotifyContext`, `srv.Shutdown` 10s).
3. Web: `pnpm create vite apps/web --template react-ts`; cài `tailwindcss @tailwindcss/vite`, `react-router`, `@tanstack/react-query`; `pnpm dlx shadcn@latest init` với alias `@/shared/ui`; thêm `vitest`, `@testing-library/react`, `jsdom`. Cấu hình `build.rollupOptions.output.manualChunks` tách `react-vendor`; bật `build.reportCompressedSize`.
4. Compose dev: Postgres 16 với `POSTGRES_DB=sidecup`, port `5432` cố định; healthcheck `pg_isready`. Root `Makefile` target `dev` chạy `docker compose -f infra/docker-compose.yml up -d postgres` rồi `go run ./cmd/api` và `pnpm dev` song song (dùng `&` + `wait` hoặc `concurrently`). Không cài `air`; target `dev-api` riêng để chạy lại API nhanh khi đổi code.
5. CI: hai job `api` (Go 1.23, cache module, service container postgres cho integration test với `TEST_DATABASE_URL`) và `web` (pnpm, Node 22).
6. README root: cách chạy dev, cấu trúc thư mục (link `architecture.md` cho tới khi phase 9 viết docs chính thức).

## Todo

- [x] Khung `apps/api` chạy `/healthz`
- [x] Khung `apps/web` build và hiển thị route placeholder, shadcn `Button` import được
- [x] `infra/docker-compose.yml` + root `Makefile`
- [x] Dockerfile api/web build thành công
- [ ] CI xanh trên commit đầu

## Success Criteria

- `make dev` → `curl localhost:8080/healthz` trả 200; `http://localhost:5173` hiển thị placeholder; `curl localhost:5173/api/healthz` qua proxy trả 200.
- `docker build -f apps/api/Dockerfile apps/api` và `docker build -f apps/web/Dockerfile apps/web` thành công.
- `go test ./...` và `pnpm test` chạy (0 test cũng được) và exit 0.

## Risk Assessment

- shadcn CLI đổi cấu trúc theo phiên bản: chốt phiên bản trong `package.json`, commit `components.json`.
- Port 5432/8080/5173 đã bị chiếm trên máy dev: `Makefile` kiểm tra `lsof -i` và báo rõ, không tự đổi port (theo `.claude/rules/process-management.md`).

## Security Considerations

- Không commit `.env`; `SESSION_SECRET`/`SELLER_PASSWORD_HASH` chỉ có placeholder trong `.env.example`.
- Image API chạy non-root (distroless `nonroot`).

## Next Steps

Phase 2 thêm migration và GORM models vào khung này.
