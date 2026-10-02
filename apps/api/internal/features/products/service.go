package products

import (
	"context"
	"errors"
	"net/url"
	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"sidecup/api/internal/platform/apperr"
)

// MenuBroadcaster: món đổi thì mọi trang menu đang mở cần biết (món dùng chung cho mọi quán).
type MenuBroadcaster interface {
	BroadcastAll(ctx context.Context)
}

var errNotFound = apperr.NotFound("PRODUCT_NOT_FOUND", "Không tìm thấy món")

type Service struct {
	db   *gorm.DB
	menu MenuBroadcaster
}

func NewService(db *gorm.DB, menu MenuBroadcaster) *Service {
	return &Service{db: db, menu: menu}
}

func (s *Service) List(ctx context.Context) ([]View, error) {
	var ps []Product
	if err := s.db.WithContext(ctx).Order("sort, name").Find(&ps).Error; err != nil {
		return nil, err
	}
	out := make([]View, len(ps))
	for i, p := range ps {
		out[i] = ToView(p)
	}
	return out, nil
}

func (s *Service) Create(ctx context.Context, req UpsertReq) (View, error) {
	p := Product{Available: true}
	if err := apply(&p, req); err != nil {
		return View{}, err
	}
	if err := s.db.WithContext(ctx).Create(&p).Error; err != nil {
		return View{}, err
	}
	s.menu.BroadcastAll(ctx)
	return ToView(p), nil
}

func (s *Service) Update(ctx context.Context, id uuid.UUID, req UpsertReq) (View, error) {
	p, err := s.get(ctx, id)
	if err != nil {
		return View{}, err
	}
	if err := apply(&p, req); err != nil {
		return View{}, err
	}
	err = s.db.WithContext(ctx).Model(&p).Updates(map[string]any{
		"name": p.Name, "price": p.Price, "image_url": p.ImageURL, "has_sweet": p.HasSweet,
		"has_ice": p.HasIce, "available": p.Available, "sort": p.Sort,
	}).Error
	if err != nil {
		return View{}, err
	}
	s.menu.BroadcastAll(ctx)
	return ToView(p), nil
}

// SetAvailability là thao tác nóng giờ trưa: một cột, không đụng phần còn lại.
func (s *Service) SetAvailability(ctx context.Context, id uuid.UUID, available bool) (View, error) {
	p, err := s.get(ctx, id)
	if err != nil {
		return View{}, err
	}
	if err := s.db.WithContext(ctx).Model(&p).Update("available", available).Error; err != nil {
		return View{}, err
	}
	p.Available = available
	s.menu.BroadcastAll(ctx)
	return ToView(p), nil
}

func (s *Service) get(ctx context.Context, id uuid.UUID) (Product, error) {
	var p Product
	err := s.db.WithContext(ctx).First(&p, "id = ?", id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return p, errNotFound
	}
	return p, err
}

func apply(p *Product, req UpsertReq) error {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return apperr.Field("name", "Không được để trống")
	}
	var image *string
	if req.ImageURL != nil {
		if v := strings.TrimSpace(*req.ImageURL); v != "" {
			u, err := url.Parse(v)
			// Chỉ https: trang chạy trên https nên ảnh http bị trình duyệt chặn (mixed content, CSP).
			if err != nil || u.Scheme != "https" || u.Host == "" {
				return apperr.Field("image_url", "Đường dẫn ảnh phải bắt đầu bằng https://")
			}
			image = &v
		}
	}
	p.Name = name
	p.Price = req.Price
	p.ImageURL = image
	p.HasSweet = req.HasSweet
	p.HasIce = req.HasIce
	p.Sort = req.Sort
	if req.Available != nil {
		p.Available = *req.Available
	}
	return nil
}
