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
)

// seedCmd nạp dữ liệu mẫu (menu, quán, bàn), chạy lại nhiều lần không nhân bản (ON CONFLICT DO NOTHING). Chỉ cho dev/e2e.
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
			{`INSERT INTO products (id, name, price, sort)
			  SELECT v.id::uuid, v.name, v.price, v.sort
			  FROM (VALUES
			      ('00000000-0000-4000-a000-000000000101', 'Cà phê đen đá',                 35000, 101),
			      ('00000000-0000-4000-a000-000000000102', 'Cà phê nâu đá',                 35000, 102),
			      ('00000000-0000-4000-a000-000000000103', 'Cà phê muối',                   39000, 103),
			      ('00000000-0000-4000-a000-000000000104', 'Bạc xỉu',                       37000, 104),
			      ('00000000-0000-4000-a000-000000000201', 'Nước sấu',                      23000, 201),
			      ('00000000-0000-4000-a000-000000000202', 'Nước mơ',                       23000, 202),
			      ('00000000-0000-4000-a000-000000000203', 'Nước xí muội',                  23000, 203),
			      ('00000000-0000-4000-a000-000000000301', 'Sữa chua đánh đá',              31000, 301),
			      ('00000000-0000-4000-a000-000000000302', 'Sữa chua cam',                  39000, 302),
			      ('00000000-0000-4000-a000-000000000303', 'Sữa chua chanh dây',            39000, 303),
			      ('00000000-0000-4000-a000-000000000304', 'Sữa chua cafe',                 39000, 304),
			      ('00000000-0000-4000-a000-000000000401', 'Cam tươi',                      28000, 401),
			      ('00000000-0000-4000-a000-000000000402', 'Chanh dây',                     33000, 402),
			      ('00000000-0000-4000-a000-000000000501', 'Sinh tố bơ',                    45000, 501),
			      ('00000000-0000-4000-a000-000000000502', 'Sinh tố mãng cầu',              45000, 502),
			      ('00000000-0000-4000-a000-000000000503', 'Sinh tố xoài',                  45000, 503),
			      ('00000000-0000-4000-a000-000000000601', 'Sữa tươi trân châu đường đen',  32000, 601),
			      ('00000000-0000-4000-a000-000000000602', 'Sữa chuối trân châu đường đen', 38000, 602)
			  ) AS v(id, name, price, sort)
			  WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.name = v.name)
			  ON CONFLICT (id) DO NOTHING`, nil},
			{`INSERT INTO partners (id, name, commission_rate, payout_period, open_hours)
			  VALUES (?, 'Quán test', 0.1500, 'week', '[{"days":[1,2,3,4,5,6,7],"from":"11:00","to":"13:30"}]')
			  ON CONFLICT (id) DO NOTHING`, []any{seedPartnerID}},
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
		fmt.Println("seed xong: menu mẫu, Quán test, bàn DEVTEST001..003")
		return nil
	})
}
