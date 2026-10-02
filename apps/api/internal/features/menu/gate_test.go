package menu

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"sidecup/api/internal/features/partners"
	"sidecup/api/internal/features/settings"
	"sidecup/api/internal/platform/apperr"
)

func vn(t *testing.T) *time.Location {
	loc, err := time.LoadLocation("Asia/Ho_Chi_Minh")
	require.NoError(t, err)
	return loc
}

func lunch() partners.OpenHours {
	return partners.OpenHours{
		{Days: []int{1, 2, 3, 4, 5}, From: "11:00", To: "13:30"},
		{Days: []int{5}, From: "22:00", To: "02:00"},
	}
}

func reason(o Ordering) string {
	if o.Reason == nil {
		return ""
	}
	return *o.Reason
}

func TestOrderingGate(t *testing.T) {
	loc := vn(t)
	p := partners.Partner{OpenHours: lunch(), Active: true}
	open := settings.Settings{AcceptingOrders: true}
	paused := settings.Settings{AcceptingOrders: false}
	monNoon := time.Date(2026, 9, 28, 12, 0, 0, 0, loc)
	monEvening := time.Date(2026, 9, 28, 18, 0, 0, 0, loc)
	satEarly := time.Date(2026, 10, 3, 1, 0, 0, 0, loc) // thuộc khung tối Thứ Sáu
	sunNoon := time.Date(2026, 10, 4, 12, 0, 0, 0, loc)

	g := OrderingGate(p, open, monNoon, loc)
	assert.True(t, g.Enabled)
	assert.Nil(t, g.Reason)
	assert.Equal(t, []string{"11:00–13:30"}, g.HoursToday)
	assert.NoError(t, g.Err())

	assert.Equal(t, ReasonClosed, reason(OrderingGate(p, open, monEvening, loc)))
	assert.True(t, OrderingGate(p, open, satEarly, loc).Enabled, "khung qua nửa đêm")
	g = OrderingGate(p, open, sunNoon, loc)
	assert.Equal(t, ReasonClosed, reason(g), "ngày không có khung")
	assert.Equal(t, []string{}, g.HoursToday)

	assert.Equal(t, ReasonPaused, reason(OrderingGate(p, paused, monEvening, loc)), "tạm ngưng ưu tiên hơn ngoài giờ")
	inactive := p
	inactive.Active = false
	assert.Equal(t, ReasonClosed, reason(OrderingGate(inactive, open, monEvening, loc)), "ngoài giờ ưu tiên hơn quán ngừng")
	assert.Equal(t, ReasonInactive, reason(OrderingGate(inactive, open, monNoon, loc)))
}

func TestOrderingGateErrors(t *testing.T) {
	loc := vn(t)
	p := partners.Partner{OpenHours: lunch(), Active: true}
	codes := map[string]settings.Settings{"PAUSED": {AcceptingOrders: false}, "OUTSIDE_HOURS": {AcceptingOrders: true}}
	for code, st := range codes {
		err := OrderingGate(p, st, time.Date(2026, 9, 28, 18, 0, 0, 0, loc), loc).Err()
		e, ok := apperr.As(err)
		require.True(t, ok)
		assert.Equal(t, 409, e.Status)
		assert.Equal(t, code, e.Code)
	}
}
