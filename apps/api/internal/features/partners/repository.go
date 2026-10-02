package partners

import (
	"context"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

func (r *Repository) List(ctx context.Context) ([]Partner, error) {
	var ps []Partner
	err := r.db.WithContext(ctx).Order("active DESC, name").Find(&ps).Error
	return ps, err
}

func (r *Repository) Get(ctx context.Context, tx *gorm.DB, id uuid.UUID) (Partner, error) {
	var p Partner
	err := tx.WithContext(ctx).First(&p, "id = ?", id).Error
	return p, err
}

// HiddenByPartner trả map partner → món ẩn; ids rỗng nghĩa là mọi quán.
func (r *Repository) HiddenByPartner(ctx context.Context, ids ...uuid.UUID) (map[uuid.UUID][]uuid.UUID, error) {
	var rows []HiddenProduct
	q := r.db.WithContext(ctx).Order("partner_id, product_id")
	if len(ids) > 0 {
		q = q.Where("partner_id IN ?", ids)
	}
	if err := q.Find(&rows).Error; err != nil {
		return nil, err
	}
	out := map[uuid.UUID][]uuid.UUID{}
	for _, row := range rows {
		out[row.PartnerID] = append(out[row.PartnerID], row.ProductID)
	}
	return out, nil
}

// ReplaceHidden thay toàn bộ danh sách món ẩn của quán trong transaction của caller.
func (r *Repository) ReplaceHidden(ctx context.Context, tx *gorm.DB, partnerID uuid.UUID, productIDs []uuid.UUID) error {
	tx = tx.WithContext(ctx)
	if err := tx.Where("partner_id = ?", partnerID).Delete(&HiddenProduct{}).Error; err != nil {
		return err
	}
	if len(productIDs) == 0 {
		return nil
	}
	rows := make([]HiddenProduct, len(productIDs))
	for i, id := range productIDs {
		rows[i] = HiddenProduct{PartnerID: partnerID, ProductID: id}
	}
	return tx.Create(&rows).Error
}

func (r *Repository) CountProducts(ctx context.Context, tx *gorm.DB, ids []uuid.UUID) (int64, error) {
	var n int64
	err := tx.WithContext(ctx).Table("products").Where("id IN ?", ids).Count(&n).Error
	return n, err
}
