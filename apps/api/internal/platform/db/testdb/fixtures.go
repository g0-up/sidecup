package testdb

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// Fixture dùng raw SQL để testdb không import package feature (tránh vòng import trong test nội bộ).

type PartnerOpts struct {
	Name      string
	Rate      string // numeric, ví dụ "0.1500"
	Period    string
	OpenHours string // JSON
	Inactive  bool
}

func SeedPartner(t testing.TB, gdb *gorm.DB, o PartnerOpts) uuid.UUID {
	t.Helper()
	if o.Name == "" {
		o.Name = "Quán test"
	}
	if o.Rate == "" {
		o.Rate = "0.1500"
	}
	if o.Period == "" {
		o.Period = "week"
	}
	if o.OpenHours == "" {
		o.OpenHours = `[{"days":[1,2,3,4,5,6,7],"from":"00:00","to":"23:59"}]`
	}
	var id uuid.UUID
	require.NoError(t, gdb.Raw(`INSERT INTO partners (name, commission_rate, payout_period, open_hours, active)
		VALUES (?, ?::numeric, ?, ?::jsonb, ?) RETURNING id`, o.Name, o.Rate, o.Period, o.OpenHours, !o.Inactive).Row().Scan(&id))
	return id
}

type ProductOpts struct {
	Name        string
	Price       int64
	NoSweet     bool
	NoIce       bool
	Unavailable bool
	Sort        int
}

func SeedProduct(t testing.TB, gdb *gorm.DB, o ProductOpts) uuid.UUID {
	t.Helper()
	if o.Name == "" {
		o.Name = "Trà đá"
	}
	var id uuid.UUID
	require.NoError(t, gdb.Raw(`INSERT INTO products (name, price, has_sweet, has_ice, available, sort)
		VALUES (?, ?, ?, ?, ?, ?) RETURNING id`, o.Name, o.Price, !o.NoSweet, !o.NoIce, !o.Unavailable, o.Sort).Row().Scan(&id))
	return id
}

func HideProduct(t testing.TB, gdb *gorm.DB, partnerID, productID uuid.UUID) {
	t.Helper()
	require.NoError(t, gdb.Exec(`INSERT INTO partner_hidden_products (partner_id, product_id) VALUES (?, ?)`, partnerID, productID).Error)
}

func SeedQR(t testing.TB, gdb *gorm.DB, partnerID uuid.UUID, token, table string) string {
	t.Helper()
	require.NoError(t, gdb.Exec(`INSERT INTO qr_codes (token, partner_id, table_label) VALUES (?, ?, ?)`, token, partnerID, table).Error)
	return token
}

func SetBank(t testing.TB, gdb *gorm.DB, bin, account, name string) {
	t.Helper()
	require.NoError(t, gdb.Exec(`UPDATE settings SET bank_bin = ?, bank_account = ?, bank_account_name = ? WHERE id = 1`, bin, account, name).Error)
}
