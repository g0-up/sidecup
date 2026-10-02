package clock

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTodayInUsesLocationNotUTC(t *testing.T) {
	loc, err := time.LoadLocation("Asia/Ho_Chi_Minh")
	require.NoError(t, err)
	// 18:30 UTC ngày 30/09 là 01:30 ngày 01/10 ở Việt Nam.
	utc := time.Date(2026, 9, 30, 18, 30, 0, 0, time.UTC)
	got := TodayIn(utc, loc)
	assert.Equal(t, time.Date(2026, 10, 1, 0, 0, 0, 0, loc), got)
}

func TestISOWeekday(t *testing.T) {
	assert.Equal(t, 1, ISOWeekday(time.Date(2026, 9, 28, 12, 0, 0, 0, time.UTC))) // Thứ Hai
	assert.Equal(t, 7, ISOWeekday(time.Date(2026, 10, 4, 12, 0, 0, 0, time.UTC))) // Chủ Nhật
}

func TestFakeAdvance(t *testing.T) {
	start := time.Date(2026, 10, 1, 8, 0, 0, 0, time.UTC)
	f := NewFake(start, time.UTC)
	f.Advance(5 * time.Minute)
	assert.Equal(t, start.Add(5*time.Minute), f.Now())
}
