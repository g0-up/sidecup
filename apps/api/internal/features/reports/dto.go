package reports

import (
	"time"

	"github.com/google/uuid"
)

type CommissionLine struct {
	PartnerID        uuid.UUID `json:"partner_id"`
	PartnerName      string    `json:"partner_name"`
	CommissionRate   float64   `json:"commission_rate"`
	PayoutPeriod     string    `json:"payout_period"`
	From             string    `json:"from"`
	To               string    `json:"to"`
	PaidCount        int64     `json:"paid_count"`
	Revenue          int64     `json:"revenue"`
	FailedCount      int64     `json:"failed_count"`
	Commission       int64     `json:"commission"`
	AdjustmentsTotal int64     `json:"adjustments_total"`
	AdjustmentsCount int64     `json:"adjustments_count"`
	Net              int64     `json:"net"`
}

type CommissionTotal struct {
	PaidCount        int64 `json:"paid_count"`
	Revenue          int64 `json:"revenue"`
	FailedCount      int64 `json:"failed_count"`
	Commission       int64 `json:"commission"`
	AdjustmentsTotal int64 `json:"adjustments_total"`
	Net              int64 `json:"net"`
}

type CommissionReport struct {
	Rows  []CommissionLine `json:"rows"`
	Total CommissionTotal  `json:"total"`
}

type FunnelLine struct {
	PartnerID   uuid.UUID `json:"partner_id"`
	PartnerName string    `json:"partner_name"`
	Day         string    `json:"day"`
	Views       int64     `json:"views"`
	Orders      int64     `json:"orders"`
	Paid        int64     `json:"paid"`
}

type FunnelReport struct {
	From string       `json:"from"`
	To   string       `json:"to"`
	Rows []FunnelLine `json:"rows"`
}

type AdjustmentView struct {
	ID          uuid.UUID  `json:"id"`
	PartnerID   uuid.UUID  `json:"partner_id"`
	PartnerName string     `json:"partner_name"`
	OrderID     *uuid.UUID `json:"order_id"`
	OrderCode   *string    `json:"order_code"`
	Amount      int64      `json:"amount"`
	Reason      string     `json:"reason"`
	CreatedBy   string     `json:"created_by"`
	CreatedAt   time.Time  `json:"created_at"`
}

type CreateAdjustmentReq struct {
	PartnerID uuid.UUID `json:"partner_id" validate:"required"`
	Amount    int64     `json:"amount" validate:"ne=0,gte=-100000000,lte=100000000"`
	Reason    string    `json:"reason" validate:"required,max=200"`
	OrderCode string    `json:"order_code" validate:"omitempty,max=12"`
}

// Query là bộ lọc chung: partner_id tuỳ chọn; period=current|previous hoặc from/to.
type Query struct {
	PartnerID *uuid.UUID
	Period    string
	From, To  string
}
