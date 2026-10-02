// Package clock tách nguồn thời gian để nghiệp vụ theo giờ (giờ bán, tự huỷ, báo cáo) test được.
package clock

import (
	"sync"
	"time"
)

type Clock interface {
	Now() time.Time
	Location() *time.Location
}

type Real struct{ loc *time.Location }

func NewReal(loc *time.Location) Real { return Real{loc: loc} }

func (r Real) Now() time.Time           { return time.Now().In(r.loc) }
func (r Real) Location() *time.Location { return r.loc }

// Fake là đồng hồ đứng yên, chỉ đổi khi test gọi Set/Advance.
type Fake struct {
	mu  sync.Mutex
	now time.Time
	loc *time.Location
}

func NewFake(now time.Time, loc *time.Location) *Fake {
	return &Fake{now: now.In(loc), loc: loc}
}

func (f *Fake) Now() time.Time {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.now
}

func (f *Fake) Location() *time.Location { return f.loc }

func (f *Fake) Set(t time.Time) {
	f.mu.Lock()
	f.now = t.In(f.loc)
	f.mu.Unlock()
}

func (f *Fake) Advance(d time.Duration) {
	f.mu.Lock()
	f.now = f.now.Add(d)
	f.mu.Unlock()
}

// TodayIn trả 00:00 của ngày chứa t theo múi giờ loc.
func TodayIn(t time.Time, loc *time.Location) time.Time {
	t = t.In(loc)
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, loc)
}

// ISOWeekday đổi time.Weekday (Chủ Nhật = 0) sang ISO (Thứ Hai = 1 … Chủ Nhật = 7).
func ISOWeekday(t time.Time) int {
	if wd := int(t.Weekday()); wd != 0 {
		return wd
	}
	return 7
}
