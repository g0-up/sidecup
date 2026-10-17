package clock

import (
	"time"

	"sidecup/api/internal/platform/apperr"
)

const maxRangeDays = 366

// DateRange là khoảng ngày theo APP_TZ, hai đầu đều bao gồm.
type DateRange struct {
	From time.Time // 00:00 ngày đầu
	To   time.Time // 00:00 ngày cuối
}

// Bounds đổi sang khoảng timestamptz nửa mở [From, To+1 ngày) để lọc cột thời gian.
func (r DateRange) Bounds() (time.Time, time.Time) { return r.From, r.To.AddDate(0, 0, 1) }

func (r DateRange) Days() int { return int(r.To.Sub(r.From).Hours()/24+0.5) + 1 }

// ParseDateRange đọc from/to dạng YYYY-MM-DD theo APP_TZ.
func ParseDateRange(from, to string, loc *time.Location) (DateRange, error) {
	f, err := time.ParseInLocation(time.DateOnly, from, loc)
	if err != nil {
		return DateRange{}, apperr.Field("from", "Ngày phải có dạng YYYY-MM-DD")
	}
	t, err := time.ParseInLocation(time.DateOnly, to, loc)
	if err != nil {
		return DateRange{}, apperr.Field("to", "Ngày phải có dạng YYYY-MM-DD")
	}
	if t.Before(f) {
		return DateRange{}, apperr.Field("to", "Ngày kết thúc phải sau ngày bắt đầu")
	}
	r := DateRange{From: f, To: t}
	if r.Days() > maxRangeDays {
		return DateRange{}, apperr.Field("to", "Khoảng ngày tối đa 366 ngày")
	}
	return r, nil
}
