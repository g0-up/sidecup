package notifications

import (
	"fmt"
	"strings"

	"sidecup/api/internal/features/reports"
)

// customerStatusLabels khớp nhãn khách thấy trên trang theo dõi đơn (web: CUSTOMER_STATUS_LABEL).
var customerStatusLabels = map[string]string{
	"accepted":   "Quán đã nhận, đang pha",
	"delivering": "Đang mang ra",
	"paid":       "Đã nhận nước",
	"rejected":   "Quán từ chối",
}

// Đơn tự huỷ là trạng thái huỷ duy nhất báo khách (khách tự huỷ thì đã biết).
const timeoutCancelLabel = "Đã huỷ do quán không nhận kịp"

// RenderCustomerStatus dựng tin Zalo gửi khách khi đơn đổi trạng thái. Không chứa SĐT.
func RenderCustomerStatus(p Payload) string {
	label, ok := customerStatusLabels[p.Status]
	if !ok {
		label = timeoutCancelLabel
		if p.Status != "cancelled" {
			label = p.Status
		}
	}
	var b strings.Builder
	fmt.Fprintf(&b, "Sidecup – đơn #%s\n", p.Code)
	fmt.Fprintf(&b, "%s · Bàn %s\n", p.PartnerName, p.TableLabel)
	fmt.Fprintf(&b, "Trạng thái: %s\n", label)
	fmt.Fprintf(&b, "Tổng: %s", reports.FormatVND(p.Total))
	if p.OrderURL != "" {
		fmt.Fprintf(&b, "\nXem đơn: %s", p.OrderURL)
	}
	return b.String()
}
