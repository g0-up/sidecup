package reports

import (
	"time"

	"sidecup/api/internal/platform/clock"
)

const (
	PeriodCurrent  = "current"
	PeriodPrevious = "previous"
)

// Range là khoảng ngày theo APP_TZ, hai đầu đều bao gồm.
type Range = clock.DateRange

// Resolve tính kỳ trả hoa hồng chứa `now`: tuần Thứ Hai → Chủ Nhật, tháng ngày 1 → ngày cuối.
func Resolve(payoutPeriod, which string, now time.Time, loc *time.Location) Range {
	today := clock.TodayIn(now, loc)
	if payoutPeriod == "month" {
		from := time.Date(today.Year(), today.Month(), 1, 0, 0, 0, 0, loc)
		if which == PeriodPrevious {
			from = from.AddDate(0, -1, 0)
		}
		return Range{From: from, To: from.AddDate(0, 1, -1)}
	}
	from := today.AddDate(0, 0, -(clock.ISOWeekday(today) - 1))
	if which == PeriodPrevious {
		from = from.AddDate(0, 0, -7)
	}
	return Range{From: from, To: from.AddDate(0, 0, 6)}
}
