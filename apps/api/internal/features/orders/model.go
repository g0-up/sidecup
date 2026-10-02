package orders

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type Status string

const (
	StatusSent       Status = "sent"
	StatusAccepted   Status = "accepted"
	StatusDelivering Status = "delivering"
	StatusPaid       Status = "paid"
	StatusRejected   Status = "rejected"
	StatusCancelled  Status = "cancelled"
	StatusFailed     Status = "failed"
)

func (s Status) Valid() bool {
	switch s {
	case StatusSent, StatusAccepted, StatusDelivering, StatusPaid, StatusRejected, StatusCancelled, StatusFailed:
		return true
	}
	return false
}

// Open là các trạng thái còn hiện trên bảng đơn của người bán.
func (s Status) Open() bool {
	return s == StatusSent || s == StatusAccepted || s == StatusDelivering
}

type Actor string

const (
	ActorCustomer Actor = "customer"
	ActorSeller   Actor = "seller"
	ActorSystem   Actor = "system"
)

const (
	PaymentCash     = "cash"
	PaymentTransfer = "transfer"

	ReasonCustomer        = "customer"
	ReasonTimeout         = "timeout"
	ReasonRejected        = "seller_rejected"
	ReasonCustomerMissing = "customer_not_found"
)

var (
	ErrPaidImmutable  = errors.New("paid order is immutable")
	ErrUseOrderWriter = errors.New("orders are written only through orders.Writer")
	ErrNotFound       = errors.New("order not found or status changed")
)

// OrderItem là một dòng đã gộp, giá ghi cứng lúc đặt.
type OrderItem struct {
	ProductID uuid.UUID `json:"product_id"`
	Name      string    `json:"name"`
	UnitPrice int64     `json:"unit_price"`
	Qty       int       `json:"qty"`
	Sweet     *string   `json:"sweet"`
	Ice       *string   `json:"ice"`
	LineTotal int64     `json:"line_total"`
}

type OrderItems []OrderItem

func (it OrderItems) Value() (driver.Value, error) {
	if it == nil {
		it = OrderItems{}
	}
	b, err := json.Marshal(it)
	return string(b), err
}

func (it *OrderItems) Scan(src any) error {
	switch v := src.(type) {
	case []byte:
		return json.Unmarshal(v, it)
	case string:
		return json.Unmarshal([]byte(v), it)
	default:
		return fmt.Errorf("OrderItems: kiểu không hỗ trợ %T", src)
	}
}

type Order struct {
	ID               uuid.UUID           `gorm:"column:id;type:uuid;primaryKey"`
	Code             string              `gorm:"column:code"`
	QRToken          string              `gorm:"column:qr_token"`
	PartnerID        uuid.UUID           `gorm:"column:partner_id;type:uuid"`
	PartnerName      string              `gorm:"column:partner_name"`
	TableLabel       string              `gorm:"column:table_label"`
	Items            OrderItems          `gorm:"column:items;type:jsonb"`
	Note             *string             `gorm:"column:note"`
	Total            int64               `gorm:"column:total"`
	DiscountTotal    int64               `gorm:"column:discount_total"`
	Status           Status              `gorm:"column:status"`
	CancelReason     *string             `gorm:"column:cancel_reason"`
	PaymentMethod    *string             `gorm:"column:payment_method"`
	CommissionRate   decimal.NullDecimal `gorm:"column:commission_rate;type:numeric(5,4)"`
	CommissionAmount *int64              `gorm:"column:commission_amount"`
	CustomerPhone    *string             `gorm:"column:customer_phone"`
	ClientID         string              `gorm:"column:client_id"`
	IdempotencyKey   string              `gorm:"column:idempotency_key"`
	CreatedAt        time.Time           `gorm:"column:created_at"`
	AcceptedAt       *time.Time          `gorm:"column:accepted_at"`
	DeliveringAt     *time.Time          `gorm:"column:delivering_at"`
	PaidAt           *time.Time          `gorm:"column:paid_at"`
	ClosedAt         *time.Time          `gorm:"column:closed_at"`
	UpdatedAt        time.Time           `gorm:"column:updated_at;autoUpdateTime"`
}

func (Order) TableName() string { return "orders" }

// Hook chặn mọi đường ghi ORM (Create/Save/Updates/Delete) vào orders; chỉ Writer (raw SQL) được ghi.
// Đọc bằng Find/First không đi qua các hook này.
func (Order) BeforeCreate(*gorm.DB) error { return ErrUseOrderWriter }
func (Order) BeforeUpdate(*gorm.DB) error { return ErrUseOrderWriter }
func (Order) BeforeSave(*gorm.DB) error   { return ErrUseOrderWriter }
func (Order) BeforeDelete(*gorm.DB) error { return ErrUseOrderWriter }

type Event struct {
	ID         int64     `gorm:"column:id;primaryKey"`
	OrderID    uuid.UUID `gorm:"column:order_id;type:uuid"`
	FromStatus *Status   `gorm:"column:from_status"`
	ToStatus   Status    `gorm:"column:to_status"`
	Actor      Actor     `gorm:"column:actor"`
	Reason     *string   `gorm:"column:reason"`
	At         time.Time `gorm:"column:at"`
}

func (Event) TableName() string { return "order_events" }
