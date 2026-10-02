package reports

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func vn(t *testing.T) *time.Location {
	loc, err := time.LoadLocation("Asia/Ho_Chi_Minh")
	require.NoError(t, err)
	return loc
}

func day(loc *time.Location, y int, m time.Month, d int) time.Time {
	return time.Date(y, m, d, 0, 0, 0, 0, loc)
}

func TestResolveWeek(t *testing.T) {
	loc := vn(t)
	wed := time.Date(2026, 10, 1, 15, 0, 0, 0, loc) // Thứ Tư
	assert.Equal(t, Range{From: day(loc, 2026, 9, 28), To: day(loc, 2026, 10, 4)}, Resolve("week", PeriodCurrent, wed, loc))
	assert.Equal(t, Range{From: day(loc, 2026, 9, 21), To: day(loc, 2026, 9, 27)}, Resolve("week", PeriodPrevious, wed, loc))

	sunNight := time.Date(2026, 10, 4, 23, 59, 0, 0, loc)
	assert.Equal(t, day(loc, 2026, 9, 28), Resolve("week", PeriodCurrent, sunNight, loc).From, "Chủ Nhật thuộc tuần bắt đầu Thứ Hai trước đó")

	// 17:30 UTC Chủ Nhật = 00:30 Thứ Hai giờ Việt Nam → đã sang tuần mới.
	utc := time.Date(2026, 10, 4, 17, 30, 0, 0, time.UTC)
	assert.Equal(t, day(loc, 2026, 10, 5), Resolve("week", PeriodCurrent, utc, loc).From)

	newYear := time.Date(2026, 12, 31, 12, 0, 0, 0, loc) // Thứ Năm
	assert.Equal(t, Range{From: day(loc, 2026, 12, 28), To: day(loc, 2027, 1, 3)}, Resolve("week", PeriodCurrent, newYear, loc), "tuần vắt qua năm")
}

func TestResolveMonth(t *testing.T) {
	loc := vn(t)
	assert.Equal(t, Range{From: day(loc, 2028, 2, 1), To: day(loc, 2028, 2, 29)}, Resolve("month", PeriodCurrent, time.Date(2028, 2, 15, 0, 0, 0, 0, loc), loc), "năm nhuận")
	assert.Equal(t, Range{From: day(loc, 2026, 12, 1), To: day(loc, 2026, 12, 31)}, Resolve("month", PeriodPrevious, time.Date(2027, 1, 10, 0, 0, 0, 0, loc), loc), "kỳ trước vắt qua năm")
	assert.Equal(t, Range{From: day(loc, 2026, 2, 1), To: day(loc, 2026, 2, 28)}, Resolve("month", PeriodPrevious, time.Date(2026, 3, 31, 0, 0, 0, 0, loc), loc))
}

func TestParseRange(t *testing.T) {
	loc := vn(t)
	r, err := ParseRange("2026-09-28", "2026-10-04", loc)
	require.NoError(t, err)
	from, to := r.Bounds()
	assert.Equal(t, day(loc, 2026, 9, 28), from)
	assert.Equal(t, day(loc, 2026, 10, 5), to)
	assert.Equal(t, 7, r.Days())

	_, err = ParseRange("2026-10-04", "2026-09-28", loc)
	assert.Error(t, err)
	_, err = ParseRange("28/09/2026", "2026-10-04", loc)
	assert.Error(t, err)
	_, err = ParseRange("2025-01-01", "2026-10-04", loc)
	assert.Error(t, err)
}
