package notifications

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

const (
	KindSellerNewOrder = "seller_new_order"
	KindCustomerStatus = "customer_status"

	StatusPending = "pending"
	StatusSent    = "sent"
	StatusFailed  = "failed"

	// RecipientSeller: notifier tự biết số Zalo của người bán; outbox không lưu số đó.
	RecipientSeller = "seller"
)

type Outbox struct {
	ID            int64           `gorm:"column:id;primaryKey"`
	Kind          string          `gorm:"column:kind"`
	OrderID       uuid.UUID       `gorm:"column:order_id;type:uuid"`
	Recipient     string          `gorm:"column:recipient"`
	Payload       json.RawMessage `gorm:"column:payload;type:jsonb"`
	Status        string          `gorm:"column:status"`
	Attempts      int             `gorm:"column:attempts"`
	LastError     *string         `gorm:"column:last_error"`
	NextAttemptAt *time.Time      `gorm:"column:next_attempt_at"`
	CreatedAt     time.Time       `gorm:"column:created_at"`
	SentAt        *time.Time      `gorm:"column:sent_at"`
}

func (Outbox) TableName() string { return "notification_outbox" }

type Heartbeat struct {
	ID         int16      `gorm:"column:id;primaryKey"`
	LastSeenAt *time.Time `gorm:"column:last_seen_at"`
	SessionOK  *bool      `gorm:"column:session_ok"`
	Message    *string    `gorm:"column:message"`
}

func (Heartbeat) TableName() string { return "notifier_heartbeat" }
