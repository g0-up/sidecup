package partners

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

func TestOpenHoursValidate(t *testing.T) {
	ok := OpenHours{{Days: []int{1, 2, 3}, From: "11:00", To: "13:30"}}
	assert.NoError(t, ok.Validate())

	bad := map[string]OpenHours{
		"empty":      {},
		"no days":    {{Days: nil, From: "11:00", To: "13:00"}},
		"day 0":      {{Days: []int{0}, From: "11:00", To: "13:00"}},
		"day 8":      {{Days: []int{8}, From: "11:00", To: "13:00"}},
		"dup day":    {{Days: []int{2, 2}, From: "11:00", To: "13:00"}},
		"bad from":   {{Days: []int{1}, From: "25:00", To: "13:00"}},
		"bad format": {{Days: []int{1}, From: "9:00", To: "13:00"}},
		"same":       {{Days: []int{1}, From: "10:00", To: "10:00"}},
	}
	for name, h := range bad {
		t.Run(name, func(t *testing.T) { assert.Error(t, h.Validate()) })
	}
}

func TestOpenHoursContainsMultipleWindows(t *testing.T) {
	loc := vn(t)
	h := OpenHours{
		{Days: []int{1, 2, 3, 4, 5}, From: "11:00", To: "13:30"},
		{Days: []int{6}, From: "08:00", To: "10:00"},
	}
	mon := func(hh, mm int) time.Time { return time.Date(2026, 9, 28, hh, mm, 0, 0, loc) } // Thứ Hai
	sat := func(hh, mm int) time.Time { return time.Date(2026, 10, 3, hh, mm, 0, 0, loc) } // Thứ Bảy
	sun := time.Date(2026, 10, 4, 12, 0, 0, 0, loc)

	assert.True(t, h.Contains(mon(11, 0), loc))
	assert.True(t, h.Contains(mon(13, 30), loc), "phút cuối vẫn mở")
	assert.False(t, h.Contains(mon(13, 31), loc))
	assert.False(t, h.Contains(mon(10, 59), loc))
	assert.True(t, h.Contains(sat(9, 0), loc))
	assert.False(t, h.Contains(sat(12, 0), loc))
	assert.False(t, h.Contains(sun, loc), "ngày không có khung")
}

func TestOpenHoursContainsOvernight(t *testing.T) {
	loc := vn(t)
	// Thứ Sáu 22:00 tới 02:00 sáng Thứ Bảy.
	h := OpenHours{{Days: []int{5}, From: "22:00", To: "02:00"}}
	assert.True(t, h.Contains(time.Date(2026, 10, 2, 23, 0, 0, 0, loc), loc))
	assert.True(t, h.Contains(time.Date(2026, 10, 3, 1, 30, 0, 0, loc), loc), "sáng Thứ Bảy thuộc khung Thứ Sáu")
	assert.False(t, h.Contains(time.Date(2026, 10, 3, 23, 0, 0, 0, loc), loc), "tối Thứ Bảy không có khung")
	assert.False(t, h.Contains(time.Date(2026, 10, 2, 1, 0, 0, 0, loc), loc), "sáng Thứ Sáu thuộc khung Thứ Năm")
}

func TestOpenHoursContainsUsesAppTimezone(t *testing.T) {
	loc := vn(t)
	h := OpenHours{{Days: []int{1}, From: "11:00", To: "13:30"}}
	// 04:30 UTC Thứ Hai = 11:30 giờ Việt Nam.
	assert.True(t, h.Contains(time.Date(2026, 9, 28, 4, 30, 0, 0, time.UTC), loc))
	// 11:30 UTC = 18:30 giờ Việt Nam.
	assert.False(t, h.Contains(time.Date(2026, 9, 28, 11, 30, 0, 0, time.UTC), loc))
}

func TestOpenHoursScanValueRoundTrip(t *testing.T) {
	h := OpenHours{{Days: []int{3, 1}, From: "11:00", To: "13:30"}}.Normalize()
	v, err := h.Value()
	require.NoError(t, err)
	var back OpenHours
	require.NoError(t, back.Scan([]byte(v.(string))))
	assert.Equal(t, h, back)
	assert.Equal(t, []int{1, 3}, back[0].Days)
	assert.Equal(t, []string{"11:00–13:30"}, back.RangesOn(time.Date(2026, 9, 30, 9, 0, 0, 0, vn(t)), vn(t)))
}
