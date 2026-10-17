package orders

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

// Repository chỉ đọc. Mọi ghi vào orders đi qua Writer.
type Repository struct{}

func (Repository) Get(ctx context.Context, tx *gorm.DB, id uuid.UUID) (*Order, error) {
	var o Order
	err := tx.WithContext(ctx).First(&o, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &o, err
}

func (Repository) ByIdempotencyKey(ctx context.Context, tx *gorm.DB, key string) (*Order, error) {
	var o Order
	err := tx.WithContext(ctx).First(&o, "idempotency_key = ?", key).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &o, err
}

type ListFilter struct {
	Scope        string // "open", "closed" hoặc rỗng (mọi trạng thái)
	UpdatedAfter *time.Time
	ClosedSince  time.Time // mốc đầu ngày cho scope=closed
}

const listLimit = 300

func (Repository) List(ctx context.Context, tx *gorm.DB, f ListFilter) ([]Order, error) {
	q := tx.WithContext(ctx).Limit(listLimit)
	switch f.Scope {
	case "open":
		q = q.Where("status IN ?", []Status{StatusSent, StatusAccepted, StatusDelivering}).Order("created_at ASC")
	case "closed":
		q = q.Where("status NOT IN ? AND closed_at >= ?", []Status{StatusSent, StatusAccepted, StatusDelivering}, f.ClosedSince).
			Order("closed_at DESC")
	default:
		// Mới nhất trước: nếu chạm giới hạn thì phần bị cắt là thay đổi cũ, không phải đơn mới.
		q = q.Order("updated_at DESC")
	}
	if f.UpdatedAfter != nil {
		q = q.Where("updated_at > ?", *f.UpdatedAfter)
	}
	var out []Order
	err := q.Find(&out).Error
	return out, err
}

// Cursor là đơn cuối của trang trước theo thứ tự (created_at DESC, id DESC).
type Cursor struct {
	CreatedAt time.Time
	ID        uuid.UUID
}

type HistoryFilter struct {
	From, To  time.Time // nửa mở [From, To) trên created_at
	Status    *Status
	PartnerID *uuid.UUID
	Before    *Cursor
}

const historyPageSize = 100

// History đọc đơn đặt trong khoảng thời gian, mọi trạng thái, mới nhất trước; id phá hoà khi trùng created_at.
func (Repository) History(ctx context.Context, tx *gorm.DB, f HistoryFilter, limit int) ([]Order, error) {
	q := tx.WithContext(ctx).Where("created_at >= ? AND created_at < ?", f.From, f.To)
	if f.Status != nil {
		q = q.Where("status = ?", *f.Status)
	}
	if f.PartnerID != nil {
		q = q.Where("partner_id = ?", *f.PartnerID)
	}
	if f.Before != nil {
		q = q.Where("(created_at, id) < (?, ?)", f.Before.CreatedAt, f.Before.ID)
	}
	var out []Order
	err := q.Order("created_at DESC, id DESC").Limit(limit).Find(&out).Error
	return out, err
}

// ExpiredSent trả id các đơn `sent` tạo trước mốc cutoff (để scheduler tự huỷ).
func (Repository) ExpiredSent(ctx context.Context, tx *gorm.DB, cutoff time.Time, limit int) ([]uuid.UUID, error) {
	var ids []uuid.UUID
	err := tx.WithContext(ctx).Model(&Order{}).
		Where("status = ? AND created_at < ?", StatusSent, cutoff).
		Order("created_at").Limit(limit).Pluck("id", &ids).Error
	return ids, err
}

// PaidInputs đọc tổng tiền đơn và tỷ lệ hoa hồng hiện tại của quán, trong transaction chuyển sang `paid`.
func (Repository) PaidInputs(ctx context.Context, tx *gorm.DB, id uuid.UUID) (int64, decimal.Decimal, error) {
	var row struct {
		Total          int64
		CommissionRate decimal.Decimal
	}
	err := tx.WithContext(ctx).Raw(`SELECT o.total, p.commission_rate FROM orders o
		JOIN partners p ON p.id = o.partner_id WHERE o.id = ?`, id).Scan(&row).Error
	return row.Total, row.CommissionRate, err
}

func (Repository) InsertEvent(ctx context.Context, tx *gorm.DB, e Event) error {
	return tx.WithContext(ctx).Create(&e).Error
}
