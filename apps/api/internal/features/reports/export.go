package reports

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

// FormatVND: 1035000 → "1.035.000đ", -20000 → "-20.000đ".
func FormatVND(v int64) string {
	sign := ""
	if v < 0 {
		sign, v = "-", -v
	}
	s := strconv.FormatInt(v, 10)
	var b strings.Builder
	for i, r := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			b.WriteByte('.')
		}
		b.WriteRune(r)
	}
	return sign + b.String() + "đ"
}

// FormatPercent: 0.15 → "15%", 0.125 → "12,5%".
func FormatPercent(rate float64) string {
	s := strconv.FormatFloat(rate*100, 'f', 2, 64)
	s = strings.TrimRight(strings.TrimRight(s, "0"), ".")
	return strings.ReplaceAll(s, ".", ",") + "%"
}

var periodLabels = map[string]string{"week": "tuần", "month": "tháng"}

// ExportText là bản tóm tắt gửi chủ quán qua Zalo. Chỉ số liệu tổng: không SĐT, không mã đơn của khách.
func ExportText(line CommissionLine, withPeriodLabel bool) string {
	from, _ := time.Parse(time.DateOnly, line.From)
	to, _ := time.Parse(time.DateOnly, line.To)
	kind := ""
	if withPeriodLabel {
		kind = " (" + periodLabels[line.PayoutPeriod] + ")"
	}
	var b strings.Builder
	fmt.Fprintf(&b, "BÁO CÁO HOA HỒNG — %s\n", line.PartnerName)
	fmt.Fprintf(&b, "Kỳ: %s – %s%s\n", from.Format("02/01/2006"), to.Format("02/01/2006"), kind)
	fmt.Fprintf(&b, "Đơn đã thu tiền: %d   Doanh thu: %s\n", line.PaidCount, FormatVND(line.Revenue))
	fmt.Fprintf(&b, "Đơn không giao được: %d\n", line.FailedCount)
	fmt.Fprintf(&b, "Hoa hồng %s: %s\n", FormatPercent(line.CommissionRate), FormatVND(line.Commission))
	fmt.Fprintf(&b, "Điều chỉnh: %s (%d bản ghi)\n", FormatVND(line.AdjustmentsTotal), line.AdjustmentsCount)
	fmt.Fprintf(&b, "Phải trả: %s\n", FormatVND(line.Net))
	return b.String()
}
