package notifications

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestRenderCustomerStatusUsesTheCustomerLabels(t *testing.T) {
	cases := map[string]string{
		"accepted":   "Trạng thái: Quán đã nhận, đang pha",
		"delivering": "Trạng thái: Đang mang ra",
		"paid":       "Trạng thái: Đã nhận nước",
		"rejected":   "Trạng thái: Quán từ chối",
		"cancelled":  "Trạng thái: Đã huỷ do quán không nhận kịp",
	}
	for status, want := range cases {
		assert.Contains(t, RenderCustomerStatus(Payload{Status: status}), want, status)
	}
}

func TestRenderCustomerStatusLayout(t *testing.T) {
	got := RenderCustomerStatus(Payload{
		Code: "A1B2", PartnerName: "Văn phòng ABC", TableLabel: "3", Status: "delivering",
		Total: 1035000, OrderURL: "https://sidecup.vn/o/abc",
	})
	assert.Equal(t, "Sidecup – đơn #A1B2\nVăn phòng ABC · Bàn 3\nTrạng thái: Đang mang ra\nTổng: 1.035.000đ\nXem đơn: https://sidecup.vn/o/abc", got)
}
