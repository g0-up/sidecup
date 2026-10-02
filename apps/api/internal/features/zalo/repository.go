package zalo

import (
	"context"
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Repository lưu hàng zalo_account duy nhất; service phụ thuộc interface để test dùng bản giả.
type Repository interface {
	// Get trả errAccountNotFound khi chưa liên kết.
	Get(ctx context.Context) (*Account, error)
	// Upsert ghi đè tài khoản đang có (liên kết lại = thay hàng cũ).
	Upsert(ctx context.Context, acc *Account) error
	// Delete xoá cứng; trả errAccountNotFound khi không có gì để xoá.
	Delete(ctx context.Context) error
	UpdateStatus(ctx context.Context, status string) error
	// MarkVerified ghi last_verified_at: Zalo vừa nhận credentials.
	MarkVerified(ctx context.Context) error
}

type gormRepository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) Repository { return &gormRepository{db: db} }

func (r *gormRepository) Get(ctx context.Context) (*Account, error) {
	var acc Account
	err := r.db.WithContext(ctx).First(&acc, accountID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, errAccountNotFound
	}
	if err != nil {
		return nil, err
	}
	return &acc, nil
}

func (r *gormRepository) Upsert(ctx context.Context, acc *Account) error {
	if acc.ConsentVersion == "" {
		return ErrConsentRequired
	}
	// GORM gửi mọi field nên default của cột không chạy được; time.Time rỗng sẽ thành năm 1.
	now := time.Now()
	acc.ID = accountID
	if acc.Status == "" {
		acc.Status = StatusLinked
	}
	if acc.ConsentAt.IsZero() {
		acc.ConsentAt = now
	}
	if acc.LinkedAt.IsZero() {
		acc.LinkedAt = now
	}
	return r.db.WithContext(ctx).
		Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "id"}}, UpdateAll: true}).
		Create(acc).Error
}

func (r *gormRepository) Delete(ctx context.Context) error {
	res := r.db.WithContext(ctx).Delete(&Account{}, accountID)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return errAccountNotFound
	}
	return nil
}

func (r *gormRepository) UpdateStatus(ctx context.Context, status string) error {
	return r.update(ctx, map[string]any{"status": status, "updated_at": gorm.Expr("now()")})
}

func (r *gormRepository) MarkVerified(ctx context.Context) error {
	return r.update(ctx, map[string]any{"last_verified_at": gorm.Expr("now()"), "updated_at": gorm.Expr("now()")})
}

func (r *gormRepository) update(ctx context.Context, values map[string]any) error {
	res := r.db.WithContext(ctx).Model(&Account{}).Where("id = ?", accountID).Updates(values)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return errAccountNotFound
	}
	return nil
}
