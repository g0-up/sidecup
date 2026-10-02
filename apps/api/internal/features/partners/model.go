package partners

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

const (
	PayoutWeek  = "week"
	PayoutMonth = "month"
)

type Partner struct {
	ID             uuid.UUID       `gorm:"column:id;type:uuid;primaryKey;default:gen_random_uuid()"`
	Name           string          `gorm:"column:name"`
	CommissionRate decimal.Decimal `gorm:"column:commission_rate;type:numeric(5,4)"`
	PayoutPeriod   string          `gorm:"column:payout_period"`
	OpenHours      OpenHours       `gorm:"column:open_hours;type:jsonb"`
	Active         bool            `gorm:"column:active"`
	CreatedAt      time.Time       `gorm:"column:created_at;autoCreateTime"`
	UpdatedAt      time.Time       `gorm:"column:updated_at;autoUpdateTime"`
}

func (Partner) TableName() string { return "partners" }

type HiddenProduct struct {
	PartnerID uuid.UUID `gorm:"column:partner_id;type:uuid;primaryKey"`
	ProductID uuid.UUID `gorm:"column:product_id;type:uuid;primaryKey"`
}

func (HiddenProduct) TableName() string { return "partner_hidden_products" }
