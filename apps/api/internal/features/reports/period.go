package reports

import (
	"time"

	"sidecup/api/internal/platform/apperr"
	"sidecup/api/internal/platform/clock"
)

const (
	PeriodCurrent  = "current"
	PeriodPrevious = "previous"
	maxRangeDays   = 366
)

// Range là khoảng ngày theo APP_TZ, hai đầu đều bao gồm.
type Range struct {
	From time.Time // 00:00 ngày đầu
	To   time.Time // 00:00 ngày cuối
}

// Bounds đổi sang khoảng timestamptz nửa mở [From, To+1 ngày) để lọc cột thời gian.
func (r Range) Bounds() (time.Time, time.Time) { return r.From, r.To.AddDate(0, 0, 1) }

func (r Range) Days() int { return int(r.To.Sub(r.From).Hours()/24+0.5) + 1 }

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

// ParseRange đọc from/to dạng YYYY-MM-DD theo APP_TZ.
func ParseRange(from, to string, loc *time.Location) (Range, error) {
	f, err := time.ParseInLocation(time.DateOnly, from, loc)
	if err != nil {
		return Range{}, apperr.Field("from", "Ngày phải có dạng YYYY-MM-DD")
	}
	t, err := time.ParseInLocation(time.DateOnly, to, loc)
	if err != nil {
		return Range{}, apperr.Field("to", "Ngày phải có dạng YYYY-MM-DD")
	}
	if t.Before(f) {
		return Range{}, apperr.Field("to", "Ngày kết thúc phải sau ngày bắt đầu")
	}
	r := Range{From: f, To: t}
	if r.Days() > maxRangeDays {
		return Range{}, apperr.Field("to", "Khoảng ngày tối đa 366 ngày")
	}
	return r, nil
}
