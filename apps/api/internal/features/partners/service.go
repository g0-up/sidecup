package partners

import (
	"context"
	"errors"
	"slices"
	"strings"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"

	"sidecup/api/internal/platform/apperr"
	"sidecup/api/internal/platform/db"
)

// MenuBroadcaster: giờ bán, món ẩn, trạng thái quán đổi thì trang menu của quán đó cần biết.
type MenuBroadcaster interface {
	BroadcastPartner(ctx context.Context, partnerID uuid.UUID)
}

var ErrNotFound = apperr.NotFound("PARTNER_NOT_FOUND", "Không tìm thấy quán")

type Service struct {
	db   *gorm.DB
	repo *Repository
	menu MenuBroadcaster
}

func NewService(gdb *gorm.DB, menu MenuBroadcaster) *Service {
	return &Service{db: gdb, repo: NewRepository(gdb), menu: menu}
}

func (s *Service) List(ctx context.Context) ([]View, error) {
	ps, err := s.repo.List(ctx)
	if err != nil {
		return nil, err
	}
	hidden, err := s.repo.HiddenByPartner(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]View, len(ps))
	for i, p := range ps {
		out[i] = ToView(p, hidden[p.ID])
	}
	return out, nil
}

func (s *Service) Get(ctx context.Context, id uuid.UUID) (View, error) {
	p, err := s.repo.Get(ctx, s.db, id)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return View{}, ErrNotFound
	}
	if err != nil {
		return View{}, err
	}
	hidden, err := s.repo.HiddenByPartner(ctx, id)
	if err != nil {
		return View{}, err
	}
	return ToView(p, hidden[id]), nil
}

func (s *Service) Create(ctx context.Context, req UpsertReq) (View, error) {
	p := Partner{Active: true}
	hidden, err := apply(&p, req)
	if err != nil {
		return View{}, err
	}
	err = db.WithTx(ctx, s.db, func(tx *gorm.DB) error {
		if err := s.checkProducts(ctx, tx, hidden); err != nil {
			return err
		}
		if err := tx.Create(&p).Error; err != nil {
			return err
		}
		return s.repo.ReplaceHidden(ctx, tx, p.ID, hidden)
	})
	if err != nil {
		return View{}, err
	}
	s.menu.BroadcastPartner(ctx, p.ID)
	return ToView(p, hidden), nil
}

func (s *Service) Update(ctx context.Context, id uuid.UUID, req UpsertReq) (View, error) {
	var view View
	err := db.WithTx(ctx, s.db, func(tx *gorm.DB) error {
		p, err := s.repo.Get(ctx, tx, id)
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		hidden, err := apply(&p, req)
		if err != nil {
			return err
		}
		if err := s.checkProducts(ctx, tx, hidden); err != nil {
			return err
		}
		err = tx.Model(&p).Updates(map[string]any{
			"name": p.Name, "commission_rate": p.CommissionRate, "payout_period": p.PayoutPeriod,
			"open_hours": p.OpenHours, "active": p.Active,
		}).Error
		if err != nil {
			return err
		}
		if err := s.repo.ReplaceHidden(ctx, tx, p.ID, hidden); err != nil {
			return err
		}
		view = ToView(p, hidden)
		return nil
	})
	if err != nil {
		return View{}, err
	}
	s.menu.BroadcastPartner(ctx, id)
	return view, nil
}

func (s *Service) checkProducts(ctx context.Context, tx *gorm.DB, ids []uuid.UUID) error {
	if len(ids) == 0 {
		return nil
	}
	n, err := s.repo.CountProducts(ctx, tx, ids)
	if err != nil {
		return err
	}
	if n != int64(len(ids)) {
		return apperr.Field("hidden_product_ids", "Có món không tồn tại")
	}
	return nil
}

// apply chuẩn hoá request vào model; trả danh sách món ẩn đã khử trùng.
func apply(p *Partner, req UpsertReq) ([]uuid.UUID, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, apperr.Field("name", "Không được để trống")
	}
	if err := req.OpenHours.Validate(); err != nil {
		return nil, apperr.Field("open_hours", upperFirst(err.Error()))
	}
	rate := decimal.NewFromFloat(*req.CommissionRate)
	if !rate.Equal(rate.Round(4)) {
		return nil, apperr.Field("commission_rate", "Tỷ lệ hoa hồng tối đa 4 chữ số thập phân (ví dụ 0.1500)")
	}
	hidden := slices.Clone(req.HiddenProductIDs)
	slices.SortFunc(hidden, func(a, b uuid.UUID) int { return strings.Compare(a.String(), b.String()) })
	hidden = slices.Compact(hidden)

	p.Name = name
	p.CommissionRate = rate
	p.PayoutPeriod = req.PayoutPeriod
	p.OpenHours = req.OpenHours.Normalize()
	if req.Active != nil {
		p.Active = *req.Active
	}
	return hidden, nil
}

func upperFirst(s string) string {
	r := []rune(s)
	if len(r) == 0 {
		return s
	}
	return strings.ToUpper(string(r[0])) + string(r[1:])
}
