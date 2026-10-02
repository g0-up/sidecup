package notifications

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Notification là một tin chờ notifier Zalo gửi; ghi trong cùng transaction với thay đổi đơn.
type Notification struct {
	Kind      string
	OrderID   uuid.UUID
	Recipient string
	Payload   Payload
}

// Payload là hợp đồng với dịch vụ notifier (ngoài repo này); thêm field thì chỉ thêm, không đổi tên.
type Payload struct {
	OrderID      uuid.UUID `json:"order_id"`
	Code         string    `json:"code"`
	PartnerName  string    `json:"partner_name"`
	TableLabel   string    `json:"table_label"`
	Status       string    `json:"status"`
	CancelReason string    `json:"cancel_reason,omitempty"`
	Total        int64     `json:"total"`
	ItemsSummary string    `json:"items_summary"`
	SellerURL    string    `json:"seller_url"`
	OrderURL     string    `json:"order_url"`
}

// OutboxRepo ghi bảng notification_outbox.
type OutboxRepo struct{}

func (OutboxRepo) Enqueue(ctx context.Context, tx *gorm.DB, n Notification) error {
	payload, err := json.Marshal(n.Payload)
	if err != nil {
		return err
	}
	return tx.WithContext(ctx).Exec(`INSERT INTO notification_outbox (kind, order_id, recipient, payload)
		VALUES (?, ?, ?, ?::jsonb)`, n.Kind, n.OrderID, n.Recipient, string(payload)).Error
}

// PurgeRecipients xoá SĐT khỏi tin quá 90 ngày (mọi trạng thái), cùng nhịp với việc xoá SĐT trong orders.
func (OutboxRepo) PurgeRecipients(ctx context.Context, tx *gorm.DB, before time.Time) (int64, error) {
	res := tx.WithContext(ctx).Exec(`UPDATE notification_outbox SET recipient = ''
		WHERE kind = ? AND recipient <> '' AND created_at < ?`, KindCustomerStatus, before)
	return res.RowsAffected, res.Error
}
