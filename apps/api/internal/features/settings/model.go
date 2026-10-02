package settings

import "time"

// Settings là hàng duy nhất (id = 1) được migration tạo sẵn.
type Settings struct {
	ID              int16     `gorm:"column:id;primaryKey"`
	AcceptingOrders bool      `gorm:"column:accepting_orders"`
	EtaMinutes      int       `gorm:"column:eta_minutes"`
	BankBin         *string   `gorm:"column:bank_bin"`
	BankAccount     *string   `gorm:"column:bank_account"`
	BankAccountName *string   `gorm:"column:bank_account_name"`
	UpdatedAt       time.Time `gorm:"column:updated_at;autoUpdateTime"`
}

func (Settings) TableName() string { return "settings" }

func (s Settings) BankConfigured() bool {
	return s.BankBin != nil && *s.BankBin != "" && s.BankAccount != nil && *s.BankAccount != ""
}
