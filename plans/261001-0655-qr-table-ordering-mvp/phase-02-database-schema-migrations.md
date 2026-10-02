---
title: "Phase 2: Schema PostgreSQL và migration"
status: todo
priority: P1
effort: 1.25d
dependencies: [1]
---

# Phase 2: Schema PostgreSQL và migration

## Context Links

- [architecture.md §3 Mô hình dữ liệu](./architecture.md#3-mô-hình-dữ-liệu-postgresql-16), [§4 Máy trạng thái](./architecture.md#4-máy-trạng-thái-đơn), quyết định A9, A14 (không trigger)
- PRD: §Mô hình dữ liệu tối thiểu, §Hoa hồng và đối soát, P0-9 (đơn `paid` bất biến), P1/P2 (schema không chặn mở rộng)

## Overview

Viết migration SQL cho toàn bộ bảng, index (không trigger, không function; A14); viết GORM model tương ứng; viết `orders.Writer` là đường ghi duy nhất vào `orders` để bất biến đơn `paid` nằm ở tầng ứng dụng; runner migrate chạy lúc khởi động API và qua CLI; seed dev. Đây là hợp đồng dữ liệu cho mọi phase sau nên phải xong trước P3.

## Key Insights

- Đơn ghi cứng `partner_name`, `table_label`, `items` (tên, giá) tại thời điểm đặt (P0-4). Khoá ngoại `orders.partner_id` giữ để báo cáo gom nhóm, nhưng báo cáo hiển thị tên lấy từ `partners` hiện tại (cho phép đổi tên quán) còn hoa hồng thì từ cột đã ghi cứng.
- `orders.qr_token` không có FK tới `qr_codes` cascade delete; QR chỉ thu hồi (`active=false`), không xoá, để đơn cũ giữ dấu vết.
- Bảng `orders` chưa có `seller_id`; P2-3 thêm cột nullable sau mà không đổi cấu trúc (PRD yêu cầu).
- Bất biến đơn `paid` không dùng trigger (A14): `paid` là trạng thái cuối trong §4 nên không có chuyển đi; nếu mọi UPDATE vào `orders` đều kèm `WHERE status = $from` với `$from` do caller khai báo và Writer từ chối `$from = paid`, thì không câu lệnh nào của ứng dụng chạm được đơn `paid`. Ngoại lệ duy nhất là xoá SĐT sau 90 ngày, tách thành phương thức riêng chỉ set đúng cột đó. Hook GORM chặn đường ORM để không ai vô tình `db.Save(&order)`.
- `updated_at` không dùng trigger: GORM tự set field `UpdatedAt` (`autoUpdateTime`) với `Updates/Save`; raw SQL trong Writer luôn có `updated_at = now()`.
- P2-4 yêu cầu lưu giá gốc và giảm giá tách riêng: `items[].unit_price` và `total` đã là giá gốc; cột `discount_total bigint default 0` thêm ngay bây giờ với chi phí 0 để không phải migrate dữ liệu sau. (Đây là cột duy nhất thêm vì lý do tương lai; nghiệp vụ hiện tại luôn ghi 0.)

## Requirements

- [x] Một migration `000001_init` tạo đủ bảng ở `architecture.md §3`, kèm `down` xoá sạch.
- [x] Không có `CREATE FUNCTION`/`CREATE TRIGGER` trong migration. `updated_at` của mọi bảng: `default now()` + field GORM `UpdatedAt time.Time` tag `gorm:"column:updated_at;autoUpdateTime"`.
- [x] `orders/writer.go`: type `Writer` với đúng ba phương thức ghi: `Insert(ctx, tx, *Order) (*Order, bool, error)` (raw `INSERT ... ON CONFLICT (idempotency_key) DO NOTHING RETURNING *`, bool = đã insert), `UpdateWhereStatus(ctx, tx, id, from Status, set SetClause) (*Order, error)` (raw `UPDATE orders SET <set>, updated_at = now() WHERE id = $1 AND status = $2 RETURNING *`; trả `ErrPaidImmutable` ngay khi `from == StatusPaid` không chạm DB; `ErrNotFound` khi 0 row), `ClearCustomerPhone(ctx, tx, closedBefore time.Time) (int64, error)` (chỉ set `customer_phone = NULL, updated_at = now()`). Không có phương thức DELETE. `SetClause` chỉ nhận cột trong allowlist (`status, cancel_reason, payment_method, commission_rate, commission_amount, accepted_at, delivering_at, paid_at, closed_at`).
- [x] Hook GORM trên `Order`: `BeforeCreate/BeforeUpdate/BeforeDelete` trả `ErrUseOrderWriter`, chặn `db.Create/Save/Updates/Delete(&Order{})`. Đọc (`Find/First`) vẫn dùng GORM bình thường.
- [x] Partial/compound index như §3.
- [x] Row `settings(id=1)` và `notifier_heartbeat(id=1)` được insert trong migration (singleton rows).
- [x] GORM model cho từng bảng trong feature tương ứng (`features/<x>/model.go`), tag `gorm:"column:..."` tường minh, `items` dùng `datatypes.JSON` hoặc `json.RawMessage` với Scanner/Valuer.
- [x] `platform/db`: `Open(cfg)` (pgx qua `gorm.io/driver/postgres`, pool 10 conn, `PrepareStmt`), `Migrate(ctx, db)` dùng `iofs` embed thư mục `migrations/`, chạy tự động khi `MIGRATE_ON_START=true` (dev) và qua `go run ./cmd/api migrate up|down|version`.
- [x] GORM type `partners.OpenHours` (`[]Window{Days []int; From, To string}`) implement `Valuer/Scanner` cho cột JSONB `open_hours`; `Validate()` kiểm `days ⊆ 1..7`, `HH:MM` hợp lệ, không rỗng.
- [x] Seed dev (`cmd/api seed`): 1 quán "Quán test" (hoa hồng 15%, tuần, `open_hours` Thứ Hai–Chủ Nhật 11:00–13:30), 5 món (2 món không có tuỳ chọn đá), 3 bàn với token cố định `DEVTEST001..003`, settings ngân hàng giả. Seed idempotent (`ON CONFLICT DO NOTHING`), chỉ cho `APP_ENV=dev`.
- [x] Test integration (`//go:build integration`, `TEST_DATABASE_URL`): migrate up/down round-trip; `\df` không có function nào của app. Writer: `UpdateWhereStatus(from=paid)` → `ErrPaidImmutable`, không có query nào tới DB (kiểm bằng GORM logger hoặc `sqlmock`); `UpdateWhereStatus(from=delivering)` trên đơn đã `paid` → `ErrNotFound`, row không đổi; `SetClause` với cột ngoài allowlist (ví dụ `total`) → lỗi lúc build; `ClearCustomerPhone` xoá SĐT đơn `paid` quá hạn và set `updated_at`; `db.Updates/Delete(&Order{})` qua GORM → `ErrUseOrderWriter`; `Updates` một partner qua GORM làm `updated_at` đổi.

## Architecture

Migration là nguồn chân lý của schema; GORM model phải khớp bằng tay (không AutoMigrate). Test `TestModelsMatchSchema` dùng `db.Migrator().ColumnTypes()` so cột model với cột DB để bắt lệch sớm, và kiểm mọi model có `updated_at` đều khai báo `autoUpdateTime`.

Ràng buộc nghiệp vụ nằm ở Go, không ở DB (A14): schema chỉ có bảng, CHECK, UNIQUE, FK, DEFAULT, index. `orders.Writer` là đường ghi duy nhất vào `orders`; phase 4 (service, scheduler) chỉ gọi Writer, không viết SQL ghi vào `orders` ở nơi khác.

## Related Code Files

Create:
- `apps/api/migrations/000001_init.up.sql`, `000001_init.down.sql`
- `apps/api/internal/platform/db/db.go`, `migrate.go`, `tx.go` (helper `WithTx(ctx, fn)`), `db_test.go`
- `apps/api/internal/features/partners/model.go`, `partners/openhours.go` + `openhours_test.go`, `products/model.go`, `qrcodes/model.go`, `orders/model.go` (Order, OrderEvent, OrderItem struct cho JSON, hằng `Status*`, hook GORM chặn ghi), `orders/writer.go` + `writer_test.go` (SetClause allowlist, from=paid) + `writer_integration_test.go`, `reports/model.go` (Adjustment), `menu/model.go` (PageView), `settings/model.go`, `notifications/model.go` (Outbox, Heartbeat)
- `apps/api/cmd/api/migrate.go`, `seed.go` (subcommand qua `os.Args[1]`, không cần cobra)
- `apps/api/internal/platform/db/testdb.go` (helper mở DB test, chạy migrate, `TRUNCATE ... RESTART IDENTITY CASCADE` giữa test)

## Implementation Steps

1. Viết `000001_init.up.sql` theo §3, thứ tự: extension `pgcrypto` (cho `gen_random_uuid`), `partners`, `products`, `partner_hidden_products`, `qr_codes`, `orders`, `order_events`, `adjustments`, `page_views`, `settings`, `notification_outbox`, `notifier_heartbeat`, index, insert singleton rows. Không có `CREATE FUNCTION` hay `CREATE TRIGGER`.
2. `orders/writer.go` (bất biến ở tầng ứng dụng, A14):
   ```go
   var (
       ErrPaidImmutable  = errors.New("paid order is immutable")
       ErrUseOrderWriter = errors.New("orders are written only through orders.Writer")
       ErrNotFound       = errors.New("order not found or status changed")
   )

   func (w Writer) UpdateWhereStatus(ctx context.Context, tx *gorm.DB, id uuid.UUID, from Status, set SetClause) (*Order, error) {
       if from == StatusPaid {
           return nil, ErrPaidImmutable
       }
       sql, args, err := set.build(id, from) // SET <allowlist cols>, updated_at = now() WHERE id = ? AND status = ? RETURNING *
       if err != nil {
           return nil, err
       }
       var o Order
       res := tx.WithContext(ctx).Raw(sql, args...).Scan(&o)
       if res.Error != nil {
           return nil, res.Error
       }
       if res.RowsAffected == 0 {
           return nil, ErrNotFound
       }
       return &o, nil
   }

   func (Order) BeforeCreate(*gorm.DB) error { return ErrUseOrderWriter }
   func (Order) BeforeUpdate(*gorm.DB) error { return ErrUseOrderWriter }
   func (Order) BeforeDelete(*gorm.DB) error { return ErrUseOrderWriter }
   ```
   `Insert` và `ClearCustomerPhone` cũng là raw SQL qua `tx.Raw/Exec` nên không kích hook.
3. Viết `down.sql` drop theo thứ tự ngược.
4. `platform/db`: `Open` đọc `DATABASE_URL`, đặt `SetMaxOpenConns(10)`, `SetConnMaxLifetime(30m)`, logger GORM ở mức Warn (Info khi `LOG_LEVEL=debug`). `Migrate` dùng `migrate.NewWithInstance("iofs", source, "postgres", driver)`.
5. Model: struct có `TableName()`; `Order.Items` kiểu `OrderItems []OrderItem` implement `driver.Valuer`/`sql.Scanner` (JSONB). Không dùng `gorm.Model` (cột khác tên).
6. Seed: insert partner/products/qr với id cố định (UUID hằng) để E2E phase 9 tham chiếu.
7. Test integration theo Requirements; thêm target `make test-integration` chạy với `-tags integration`.

## Todo

- [x] `000001_init` up/down
- [x] `orders.Writer` + hook GORM + test bất biến
- [x] `platform/db` open/migrate/tx/testdb
- [x] GORM models + test khớp schema
- [x] Seed dev
- [x] `make migrate-up` / `make seed` hoạt động

## Success Criteria

- `make migrate-up && make migrate-down && make migrate-up` không lỗi trên DB trống.
- `go test -tags integration ./internal/platform/db/... ./internal/features/orders/...` xanh, trong đó test Writer chứng minh: không đường nào qua Writer hay GORM đổi được `status`/`total` của đơn `paid`; `ClearCustomerPhone` → ok; `SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal` = 0.
- `psql -c "\d orders"` khớp §3 (cột, check, index).

## Risk Assessment

- Writer chỉ chặn đường đi qua Go: UPDATE tay bằng `psql` hoặc một repository khác tự viết raw SQL vào `orders` vẫn lọt. Giảm thiểu: quy ước review "chỉ `orders/writer.go` chứa `INSERT INTO orders` / `UPDATE orders`" (A14), runbook phase 9 cấm sửa tay; nếu sau này cần chốt chặn DB thì thêm trigger bằng một migration, không đụng code.
- `numeric(5,4)` trong GORM map sang `string`/`decimal`: dùng `github.com/shopspring/decimal` cho `commission_rate`; test round-trip.

## Security Considerations

- `customer_phone` chỉ ở `orders`; không sao chép sang `order_events` hay `notification_outbox.recipient`? Outbox cần SĐT để notifier gửi → `recipient` lưu SĐT, và job xoá 90 ngày cũng phải xoá `recipient` của outbox đã `sent`/`failed` (phase 4 scheduler).
- Tài khoản DB cho API không có quyền `DROP`/`TRUNCATE` ở production (compose prod tạo role riêng, phase 9).

## Next Steps

Phase 3 dựng platform HTTP và CRUD quản trị trên schema này.
