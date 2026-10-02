package main

import (
	"context"
	"fmt"

	"gorm.io/gorm"

	"sidecup/api/internal/platform/config"
	"sidecup/api/internal/platform/db"
)

// Id cố định để E2E và người dev tham chiếu được.
const (
	seedPartnerID = "00000000-0000-4000-8000-000000000001"
	seedProduct1  = "00000000-0000-4000-8000-000000000101"
	seedProduct2  = "00000000-0000-4000-8000-000000000102"
	seedProduct3  = "00000000-0000-4000-8000-000000000103"
	seedProduct4  = "00000000-0000-4000-8000-000000000104"
	seedProduct5  = "00000000-0000-4000-8000-000000000105"
)

// seedCmd nạp dữ liệu mẫu, chạy lại nhiều lần không nhân bản (ON CONFLICT DO NOTHING). Chỉ cho dev/e2e.
func seedCmd() error {
	cfg, err := config.LoadDatabase()
	if err != nil {
		return err
	}
	if cfg.AppEnv != "dev" && cfg.AppEnv != "e2e" {
		return fmt.Errorf("seed chỉ chạy khi APP_ENV=dev hoặc e2e (đang là %q)", cfg.AppEnv)
	}
	gdb, err := db.Open(cfg.DatabaseURL, "warn")
	if err != nil {
		return err
	}
	defer func() { _ = db.Close(gdb) }()

	return db.WithTx(context.Background(), gdb, func(tx *gorm.DB) error {
		stmts := []struct {
			sql  string
			args []any
		}{
			{`INSERT INTO partners (id, name, commission_rate, payout_period, open_hours)
			  VALUES (?, 'Quán test', 0.1500, 'week', '[{"days":[1,2,3,4,5,6,7],"from":"11:00","to":"13:30"}]')
			  ON CONFLICT (id) DO NOTHING`, []any{seedPartnerID}},
			{`INSERT INTO products (id, name, price, has_sweet, has_ice, sort) VALUES
			  (?, 'Cà phê sữa đá', 25000, true, true, 1),
			  (?, 'Bạc xỉu', 29000, true, true, 2),
			  (?, 'Trà đào cam sả', 35000, true, true, 3),
			  (?, 'Cà phê đen nóng', 20000, true, false, 4),
			  (?, 'Nước suối', 10000, false, false, 5)
			  ON CONFLICT (id) DO NOTHING`, []any{seedProduct1, seedProduct2, seedProduct3, seedProduct4, seedProduct5}},
			{`INSERT INTO qr_codes (token, partner_id, table_label) VALUES
			  ('DEVTEST001', ?, 'Bàn 1'), ('DEVTEST002', ?, 'Bàn 2'), ('DEVTEST003', ?, 'Bàn 3')
			  ON CONFLICT (token) DO NOTHING`, []any{seedPartnerID, seedPartnerID, seedPartnerID}},
			{`UPDATE settings SET bank_bin = '970415', bank_account = '0123456789', bank_account_name = 'NGUYEN VAN A'
			  WHERE id = 1 AND bank_bin IS NULL`, nil},
		}
		for _, s := range stmts {
			if err := tx.Exec(s.sql, s.args...).Error; err != nil {
				return err
			}
		}
		fmt.Println("seed xong: Quán test, 5 món, bàn DEVTEST001..003")
		return nil
	})
}
