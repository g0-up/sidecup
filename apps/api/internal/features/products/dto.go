package products

import (
	"time"

	"github.com/google/uuid"
)

type View struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	Price     int64     `json:"price"`
	ImageURL  *string   `json:"image_url"`
	HasSweet  bool      `json:"has_sweet"`
	HasIce    bool      `json:"has_ice"`
	Available bool      `json:"available"`
	Sort      int       `json:"sort"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func ToView(p Product) View { return View(p) }

type UpsertReq struct {
	Name      string  `json:"name" validate:"required,max=100"`
	Price     int64   `json:"price" validate:"gte=0,lte=10000000"`
	ImageURL  *string `json:"image_url" validate:"omitempty,max=500"`
	HasSweet  bool    `json:"has_sweet"`
	HasIce    bool    `json:"has_ice"`
	Available *bool   `json:"available"`
	Sort      int     `json:"sort" validate:"gte=-10000,lte=10000"`
}

type AvailabilityReq struct {
	Available *bool `json:"available" validate:"required"`
}
