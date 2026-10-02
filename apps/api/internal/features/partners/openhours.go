package partners

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"

	"sidecup/api/internal/platform/clock"
)

// Window là một khung giờ bán áp dụng cho các thứ trong Days (ISO: 1 = Thứ Hai … 7 = Chủ Nhật).
// To < From nghĩa là khung qua nửa đêm: khung thuộc ngày bắt đầu và kéo sang sáng hôm sau.
// Hai đầu khung tính theo phút và đều bao gồm: 11:00–13:30 mở tới hết phút 13:30.
type Window struct {
	Days []int  `json:"days"`
	From string `json:"from"`
	To   string `json:"to"`
}

type OpenHours []Window

func (h OpenHours) Value() (driver.Value, error) {
	if h == nil {
		h = OpenHours{}
	}
	b, err := json.Marshal(h)
	return string(b), err
}

func (h *OpenHours) Scan(src any) error {
	switch v := src.(type) {
	case []byte:
		return json.Unmarshal(v, h)
	case string:
		return json.Unmarshal([]byte(v), h)
	case nil:
		*h = nil
		return nil
	default:
		return fmt.Errorf("OpenHours: kiểu không hỗ trợ %T", src)
	}
}

// Validate trả lỗi tiếng Việt để hiện thẳng cho người bán.
func (h OpenHours) Validate() error {
	if len(h) == 0 {
		return errors.New("cần ít nhất một khung giờ bán")
	}
	for i, w := range h {
		row := i + 1
		if len(w.Days) == 0 {
			return fmt.Errorf("khung %d: chọn ít nhất một thứ", row)
		}
		seen := map[int]bool{}
		for _, d := range w.Days {
			if d < 1 || d > 7 {
				return fmt.Errorf("khung %d: thứ phải từ 1 (Thứ Hai) tới 7 (Chủ Nhật)", row)
			}
			if seen[d] {
				return fmt.Errorf("khung %d: thứ bị lặp", row)
			}
			seen[d] = true
		}
		from, err := parseHHMM(w.From)
		if err != nil {
			return fmt.Errorf("khung %d: giờ bắt đầu %w", row, err)
		}
		to, err := parseHHMM(w.To)
		if err != nil {
			return fmt.Errorf("khung %d: giờ kết thúc %w", row, err)
		}
		if from == to {
			return fmt.Errorf("khung %d: giờ bắt đầu và kết thúc trùng nhau", row)
		}
	}
	return nil
}

// Normalize sắp thứ tăng dần để lưu và so sánh ổn định.
func (h OpenHours) Normalize() OpenHours {
	out := make(OpenHours, len(h))
	for i, w := range h {
		days := slices.Clone(w.Days)
		slices.Sort(days)
		out[i] = Window{Days: days, From: strings.TrimSpace(w.From), To: strings.TrimSpace(w.To)}
	}
	return out
}

// Contains cho biết t (đã đổi sang múi giờ của quán) có nằm trong một khung nào không.
func (h OpenHours) Contains(t time.Time, loc *time.Location) bool {
	t = t.In(loc)
	today := clock.ISOWeekday(t)
	yesterday := clock.ISOWeekday(t.AddDate(0, 0, -1))
	m := t.Hour()*60 + t.Minute()
	for _, w := range h {
		from, err1 := parseHHMM(w.From)
		to, err2 := parseHHMM(w.To)
		if err1 != nil || err2 != nil {
			continue
		}
		if from < to {
			if slices.Contains(w.Days, today) && m >= from && m <= to {
				return true
			}
			continue
		}
		// Qua nửa đêm: phần tối thuộc hôm nay, phần sáng thuộc khung của hôm qua.
		if slices.Contains(w.Days, today) && m >= from {
			return true
		}
		if slices.Contains(w.Days, yesterday) && m <= to {
			return true
		}
	}
	return false
}

// RangesOn liệt kê các khung bắt đầu trong ngày của t, dạng "11:00–13:30", để hiện lý do "Ngoài giờ bán".
func (h OpenHours) RangesOn(t time.Time, loc *time.Location) []string {
	day := clock.ISOWeekday(t.In(loc))
	var out []string
	for _, w := range h {
		if slices.Contains(w.Days, day) {
			out = append(out, w.From+"–"+w.To)
		}
	}
	return out
}

func parseHHMM(s string) (int, error) {
	parts := strings.Split(strings.TrimSpace(s), ":")
	if len(parts) != 2 || len(parts[0]) != 2 || len(parts[1]) != 2 {
		return 0, fmt.Errorf("%q phải có dạng HH:MM", s)
	}
	hh, err1 := strconv.Atoi(parts[0])
	mm, err2 := strconv.Atoi(parts[1])
	if err1 != nil || err2 != nil || hh < 0 || hh > 23 || mm < 0 || mm > 59 {
		return 0, fmt.Errorf("%q không phải giờ hợp lệ", s)
	}
	return hh*60 + mm, nil
}
