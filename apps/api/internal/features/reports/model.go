package reports

import (
	"time"

	"github.com/google/uuid"
)

// Adjustment là cách duy nhất để sửa sai số tiền sau khi đơn đã `paid`.
type Adjustment struct {
	ID        uuid.UUID  `gorm:"column:id;type:uuid;primaryKey;default:gen_random_uuid()"`
	PartnerID uuid.UUID  `gorm:"column:partner_id;type:uuid"`
	OrderID   *uuid.UUID `gorm:"column:order_id;type:uuid"`
	Amount    int64      `gorm:"column:amount"`
	Reason    string     `gorm:"column:reason"`
	CreatedBy string     `gorm:"column:created_by"`
	CreatedAt time.Time  `gorm:"column:created_at;autoCreateTime"`
}

func (Adjustment) TableName() string { return "adjustments" }
