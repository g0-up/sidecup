package menu

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"sidecup/api/internal/features/products"
	"sidecup/api/internal/platform/clock"
)

type ProductView struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	Price     int64     `json:"price"`
	ImageURL  *string   `json:"image_url"`
	HasSweet  bool      `json:"has_sweet"`
	HasIce    bool      `json:"has_ice"`
	Available bool      `json:"available"`
}

type View struct {
	Partner struct {
		Name string `json:"name"`
	} `json:"partner"`
	TableLabel string        `json:"table_label"`
	EtaMinutes int           `json:"eta_minutes"`
	Ordering   Ordering      `json:"ordering"`
	Products   []ProductView `json:"products"`
	MyOrders   []myOrder     `json:"my_orders"`
	ServerTime time.Time     `json:"server_time"`
}

// UpdatePayload là data của message menu.updated: đủ để trang menu vẽ lại mà không gọi REST.
type UpdatePayload struct {
	Products []ProductView `json:"products"`
	Ordering Ordering      `json:"ordering"`
}

func productViews(ps []products.Product) []ProductView {
	out := make([]ProductView, len(ps))
	for i, p := range ps {
		out[i] = ProductView{ID: p.ID, Name: p.Name, Price: p.Price, ImageURL: p.ImageURL, HasSweet: p.HasSweet, HasIce: p.HasIce, Available: p.Available}
	}
	return out
}

type Service struct {
	db    *gorm.DB
	clock clock.Clock
}

func NewService(db *gorm.DB, clk clock.Clock) *Service { return &Service{db: db, clock: clk} }

func (s *Service) Get(ctx context.Context, token, clientID string) (View, error) {
	qr, err := LoadQR(ctx, s.db, token)
	if err != nil {
		return View{}, err
	}
	if !qr.Active {
		return View{}, errQRRevokedGone
	}
	t, err := LoadTable(ctx, s.db, qr)
	if err != nil {
		return View{}, err
	}
	now := s.clock.Now()
	today := clock.TodayIn(now, s.clock.Location())
	mine, err := myOrders(ctx, s.db, token, clientID, today)
	if err != nil {
		return View{}, err
	}
	// Page view là số liệu phễu, không được làm hỏng trang menu nếu ghi lỗi.
	if err := recordPageView(ctx, s.db, token, clientID, today, now); err != nil {
		slog.WarnContext(ctx, "record page view", "err", err)
	}

	v := View{
		TableLabel: qr.TableLabel,
		EtaMinutes: t.Settings.EtaMinutes,
		Ordering:   OrderingGate(t.Partner, t.Settings, now, s.clock.Location()),
		Products:   productViews(t.Products),
		MyOrders:   mine,
		ServerTime: now,
	}
	v.Partner.Name = t.Partner.Name
	return v, nil
}
