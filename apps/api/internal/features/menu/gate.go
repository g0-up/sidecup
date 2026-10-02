package menu

import (
	"time"

	"sidecup/api/internal/features/partners"
	"sidecup/api/internal/features/settings"
	"sidecup/api/internal/platform/apperr"
)

const (
	ReasonPaused   = "paused"
	ReasonClosed   = "closed"
	ReasonInactive = "inactive"
)

// Ordering cho biết trang khách có được đặt không; GET menu và POST đơn dùng chung một hàm.
type Ordering struct {
	Enabled    bool     `json:"enabled"`
	Reason     *string  `json:"reason"`
	HoursToday []string `json:"hours_today"`
}

// OrderingGate: tạm ngưng (cài đặt) > ngoài giờ bán (giờ của quán theo APP_TZ) > quán ngừng hợp tác.
func OrderingGate(p partners.Partner, st settings.Settings, now time.Time, loc *time.Location) Ordering {
	o := Ordering{Enabled: true, HoursToday: p.OpenHours.RangesOn(now, loc)}
	if o.HoursToday == nil {
		o.HoursToday = []string{}
	}
	var reason string
	switch {
	case !st.AcceptingOrders:
		reason = ReasonPaused
	case !p.OpenHours.Contains(now, loc):
		reason = ReasonClosed
	case !p.Active:
		reason = ReasonInactive
	}
	if reason != "" {
		o.Enabled = false
		o.Reason = &reason
	}
	return o
}

// Err đổi lý do khoá thành lỗi 409 cho POST đơn.
func (o Ordering) Err() error {
	if o.Enabled || o.Reason == nil {
		return nil
	}
	switch *o.Reason {
	case ReasonPaused:
		return apperr.Conflict("PAUSED", "Quán tạm ngưng nhận đơn, bạn thử lại sau ít phút nhé")
	case ReasonClosed:
		return apperr.Conflict("OUTSIDE_HOURS", "Đang ngoài giờ bán").With("hours_today", o.HoursToday)
	default:
		return apperr.Conflict("PARTNER_INACTIVE", "Quán hiện không nhận đơn qua mã này")
	}
}
