package orders

import (
	"slices"
	"time"

	"github.com/shopspring/decimal"
)

type rule struct {
	from, to Status
	actors   []Actor
}

// transitions là toàn bộ máy trạng thái (architecture §4). `paid` không có chuyển đi nào.
var transitions = []rule{
	{StatusSent, StatusAccepted, []Actor{ActorSeller}},
	{StatusSent, StatusRejected, []Actor{ActorSeller}},
	{StatusSent, StatusCancelled, []Actor{ActorCustomer, ActorSystem}},
	{StatusAccepted, StatusDelivering, []Actor{ActorSeller}},
	{StatusDelivering, StatusPaid, []Actor{ActorSeller}},
	{StatusDelivering, StatusFailed, []Actor{ActorSeller}},
}

func CanTransition(from, to Status, actor Actor) bool {
	for _, r := range transitions {
		if r.from == from && r.to == to {
			return slices.Contains(r.actors, actor)
		}
	}
	return false
}

// TransitionOpts mang dữ liệu phụ của từng chuyển trạng thái.
type TransitionOpts struct {
	PaymentMethod  string
	Reason         string
	CommissionRate decimal.Decimal // chỉ dùng khi tới `paid`, đọc từ quán trong cùng transaction
	Total          int64
}

// applyTransition là nơi duy nhất biết chuyển tới `to` phải set những cột nào.
func applyTransition(to Status, now time.Time, opts TransitionOpts) SetClause {
	set := Set("status", to)
	switch to {
	case StatusAccepted:
		set = set.Set("accepted_at", now)
	case StatusDelivering:
		set = set.Set("delivering_at", now)
	case StatusPaid:
		set = set.Set("paid_at", now).Set("closed_at", now).
			Set("payment_method", opts.PaymentMethod).
			Set("commission_rate", opts.CommissionRate).
			Set("commission_amount", Commission(opts.Total, opts.CommissionRate))
	case StatusRejected, StatusCancelled, StatusFailed:
		set = set.Set("closed_at", now).Set("cancel_reason", opts.Reason)
	}
	return set
}

// Commission làm tròn nửa lên như ROUND của PostgreSQL; VND không có phần lẻ.
func Commission(total int64, rate decimal.Decimal) int64 {
	return decimal.NewFromInt(total).Mul(rate).Round(0).IntPart()
}

// notifiesCustomer: khách huỷ và không gặp khách thì không gửi tin (PRD P0-11).
func notifiesCustomer(to Status, reason string) bool {
	switch to {
	case StatusAccepted, StatusDelivering, StatusPaid, StatusRejected:
		return true
	case StatusCancelled:
		return reason == ReasonTimeout
	}
	return false
}
