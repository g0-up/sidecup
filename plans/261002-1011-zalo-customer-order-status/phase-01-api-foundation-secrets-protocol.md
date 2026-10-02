---
phase: 1
title: "Nền tảng: secrets, protocol, migration, config"
status: completed
priority: P1
effort: "4h"
dependencies: []
---

# Phase 1: Nền tảng — secrets, protocol, migration, config

## Goal
Có gói mã hoá at-rest, gói protocol Zalo biên dịch và test xanh trên Go 1.25, bảng `zalo_account` và biến `ZALO_CREDENTIAL_KEY` — chưa có hành vi nào thấy được từ ngoài.

## Nguồn
Lấy từ `0pen-future/teka@4b33e6e06e1fc12fc681f27bb37d552eba022656` (user là admin repo). Nếu bản tải trong scratchpad đã mất, tải lại bằng:
`gh api "repos/0pen-future/teka/contents/<path>?ref=4b33e6e06e1fc12fc681f27bb37d552eba022656" -H "Accept: application/vnd.github.raw"`.

## Files
- Create: `apps/api/internal/platform/secrets/secrets.go`, `secrets_test.go` — chép `apps/api/internal/shared/secrets/*` của teka, đổi package path. AES-256-GCM, key ≥ 32 byte qua sha256, nonce prefix. Comment tiếng Việt theo repo.
- Create: `apps/api/internal/features/zalo/protocol/*.go` (+ `_test.go`) — chép nguyên `auth, client, config, contacts, crypto, doc, errors, models, send`. Giữ dòng ghi công `Ported from zcago (MIT): https://github.com/amrakk/zcago` trong `doc.go`; bỏ chữ "Teka" khỏi doc comment. Không import gì ngoài stdlib, `github.com/google/uuid`, `golang.org/x/sync/errgroup` (đều đã có trong `go.mod`).
- Create: `apps/api/migrations/000003_zalo_account.up.sql` / `.down.sql`.
- Modify: `apps/api/internal/platform/config/config.go` (+ `config_test.go`) — thêm `ZaloCredentialKey string \`env:"ZALO_CREDENTIAL_KEY"\``; rỗng là hợp lệ (tính năng tắt); khác rỗng mà < 32 byte → lỗi `ZALO_CREDENTIAL_KEY phải dài ít nhất 32 byte`. Thêm `func (c Config) ZaloEnabled() bool`.
- Modify: `apps/api/.env.example` (placeholder, không giá trị thật), `infra/` compose env nếu API env được liệt kê ở đó.

## Migration

```sql
-- 000003_zalo_account.up.sql
-- Một tài khoản Zalo cá nhân gửi tin cho cả deployment (một người bán). credentials là
-- IMEI + cookie phiên Zalo = toàn quyền tài khoản, nên chỉ lưu bản mã hoá AES-GCM.
CREATE TABLE zalo_account (
    id                    smallint PRIMARY KEY CHECK (id = 1),
    encrypted_credentials bytea       NOT NULL,
    zalo_uid              text,
    display_name          text,
    status                text        NOT NULL CHECK (status IN ('linked', 'expired')),
    consent_version       text        NOT NULL,
    consent_at            timestamptz NOT NULL,
    linked_at             timestamptz NOT NULL,
    last_verified_at      timestamptz,
    updated_at            timestamptz NOT NULL DEFAULT now()
);
-- down: DROP TABLE zalo_account;
```

Không có soft delete: ngắt kết nối là xoá hàng (credentials không được sống sót sau khi người bán yêu cầu bỏ).

## Steps
1. Chép `secrets` + test; `go test ./internal/platform/secrets/`.
2. Chép `protocol` + test; sửa import path; `go build ./... && go test -race ./internal/features/zalo/protocol/`. Nếu có API chỉ có ở Go 1.26 thì thay bằng tương đương 1.25 (không nâng Go version).
3. Viết migration; chạy `make migrate-up && make migrate-down && make migrate-up` trên DB dev. **Lưu ý (rút ra khi làm):** `migrate down` lùi toàn bộ về 0 và xoá dữ liệu dev — phải sao lưu trước; vòng up/down đã có `TestMigrateRoundTrip` trên DB test nên không cần chạy trên DB dev.
4. Config + test cho 3 trường hợp: rỗng, ngắn, đủ dài.

## Verification
- `cd apps/api && go vet ./... && go test -race ./internal/platform/... ./internal/features/zalo/...`
- `make test-integration` vẫn xanh (migration chạy trong harness).

## Risk
Protocol test của teka có thể dùng `httptest` với giả định timing — nếu flaky dưới `-race`, ghi lại và sửa test, không bỏ.
