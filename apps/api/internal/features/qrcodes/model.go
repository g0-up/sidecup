package qrcodes

import (
	"time"

	"github.com/google/uuid"
)

// QRCode chỉ bị thu hồi (active=false), không bao giờ bị xoá, để đơn cũ giữ dấu vết bàn.
type QRCode struct {
	Token      string     `gorm:"column:token;primaryKey"`
	PartnerID  uuid.UUID  `gorm:"column:partner_id;type:uuid"`
	TableLabel string     `gorm:"column:table_label"`
	Active     bool       `gorm:"column:active"`
	CreatedAt  time.Time  `gorm:"column:created_at;autoCreateTime"`
	RevokedAt  *time.Time `gorm:"column:revoked_at"`
}

func (QRCode) TableName() string { return "qr_codes" }
