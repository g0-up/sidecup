package products

import (
	"time"

	"github.com/google/uuid"
)

type Product struct {
	ID        uuid.UUID `gorm:"column:id;type:uuid;primaryKey;default:gen_random_uuid()"`
	Name      string    `gorm:"column:name"`
	Price     int64     `gorm:"column:price"`
	ImageURL  *string   `gorm:"column:image_url"`
	HasSweet  bool      `gorm:"column:has_sweet"`
	HasIce    bool      `gorm:"column:has_ice"`
	Available bool      `gorm:"column:available"`
	Sort      int       `gorm:"column:sort"`
	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime"`
	UpdatedAt time.Time `gorm:"column:updated_at;autoUpdateTime"`
}

func (Product) TableName() string { return "products" }
