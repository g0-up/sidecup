package reports

import (
	"regexp"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestFormatVND(t *testing.T) {
	assert.Equal(t, "0đ", FormatVND(0))
	assert.Equal(t, "950đ", FormatVND(950))
	assert.Equal(t, "1.035.000đ", FormatVND(1035000))
	assert.Equal(t, "-20.000đ", FormatVND(-20000))
	assert.Equal(t, "155.250đ", FormatVND(155250))
}

func TestFormatPercent(t *testing.T) {
	assert.Equal(t, "15%", FormatPercent(0.15))
	assert.Equal(t, "12,5%", FormatPercent(0.125))
	assert.Equal(t, "0%", FormatPercent(0))
}

func TestExportTextMatchesSample(t *testing.T) {
	got := ExportText(CommissionLine{
		PartnerName: "Quán test", PayoutPeriod: "week", From: "2026-09-29", To: "2026-10-05", CommissionRate: 0.15,
		PaidCount: 23, Revenue: 1035000, FailedCount: 2, Commission: 155250, AdjustmentsTotal: -20000, AdjustmentsCount: 1, Net: 135250,
	}, true)
	want := "BÁO CÁO HOA HỒNG — Quán test\n" +
		"Kỳ: 29/09/2026 – 05/10/2026 (tuần)\n" +
		"Đơn đã thu tiền: 23   Doanh thu: 1.035.000đ\n" +
		"Đơn không giao được: 2\n" +
		"Hoa hồng 15%: 155.250đ\n" +
		"Điều chỉnh: -20.000đ (1 bản ghi)\n" +
		"Phải trả: 135.250đ\n"
	assert.Equal(t, want, got)
	assert.False(t, regexp.MustCompile(`0\d{9}`).MatchString(got), "không có chuỗi giống SĐT")
}
