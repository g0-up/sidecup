package partners

import (
	"time"

	"github.com/google/uuid"
)

type View struct {
	ID               uuid.UUID   `json:"id"`
	Name             string      `json:"name"`
	CommissionRate   float64     `json:"commission_rate"`
	PayoutPeriod     string      `json:"payout_period"`
	OpenHours        OpenHours   `json:"open_hours"`
	Active           bool        `json:"active"`
	HiddenProductIDs []uuid.UUID `json:"hidden_product_ids"`
	CreatedAt        time.Time   `json:"created_at"`
	UpdatedAt        time.Time   `json:"updated_at"`
}

func ToView(p Partner, hidden []uuid.UUID) View {
	rate, _ := p.CommissionRate.Float64()
	if hidden == nil {
		hidden = []uuid.UUID{}
	}
	return View{
		ID: p.ID, Name: p.Name, CommissionRate: rate, PayoutPeriod: p.PayoutPeriod, OpenHours: p.OpenHours,
		Active: p.Active, HiddenProductIDs: hidden, CreatedAt: p.CreatedAt, UpdatedAt: p.UpdatedAt,
	}
}

type UpsertReq struct {
	Name             string      `json:"name" validate:"required,max=100"`
	CommissionRate   *float64    `json:"commission_rate" validate:"required,gte=0,lte=1"`
	PayoutPeriod     string      `json:"payout_period" validate:"required,oneof=week month"`
	OpenHours        OpenHours   `json:"open_hours" validate:"required"`
	Active           *bool       `json:"active"`
	HiddenProductIDs []uuid.UUID `json:"hidden_product_ids"`
}
