package settings

import (
	"context"
	"regexp"
	"strings"

	"gorm.io/gorm"

	"sidecup/api/internal/platform/apperr"
	"sidecup/api/internal/platform/realtime"
)

// MenuBroadcaster đẩy menu.updated tới các trang menu đang mở (cài đặt đổi ảnh hưởng mọi quán).
type MenuBroadcaster interface {
	BroadcastAll(ctx context.Context)
}

type Publisher interface {
	Publish(topic, typ string, data any)
}

type Service struct {
	db   *gorm.DB
	hub  Publisher
	menu MenuBroadcaster
}

func NewService(db *gorm.DB, hub Publisher, menu MenuBroadcaster) *Service {
	return &Service{db: db, hub: hub, menu: menu}
}

func (s *Service) Get(ctx context.Context) (Settings, error) {
	return Load(ctx, s.db)
}

// Load đọc hàng settings duy nhất; dùng chung cho feature khác qua tx của chúng.
func Load(ctx context.Context, tx *gorm.DB) (Settings, error) {
	var st Settings
	err := tx.WithContext(ctx).First(&st, 1).Error
	return st, err
}

var (
	binRe     = regexp.MustCompile(`^\d{6}$`)
	accountRe = regexp.MustCompile(`^\d{6,19}$`)
)

func (s *Service) Update(ctx context.Context, req UpdateReq) (View, error) {
	fields := map[string]string{}
	updates := map[string]any{}
	if req.AcceptingOrders != nil {
		updates["accepting_orders"] = *req.AcceptingOrders
	}
	if req.EtaMinutes != nil {
		if *req.EtaMinutes < 1 || *req.EtaMinutes > 60 {
			fields["eta_minutes"] = "Thời gian giao phải từ 1 tới 60 phút"
		}
		updates["eta_minutes"] = *req.EtaMinutes
	}
	if req.BankBin != nil {
		v := strings.TrimSpace(*req.BankBin)
		if v != "" && !binRe.MatchString(v) {
			fields["bank_bin"] = "Mã BIN ngân hàng gồm đúng 6 chữ số"
		}
		updates["bank_bin"] = nullable(v)
	}
	if req.BankAccount != nil {
		v := strings.ReplaceAll(strings.TrimSpace(*req.BankAccount), " ", "")
		if v != "" && !accountRe.MatchString(v) {
			fields["bank_account"] = "Số tài khoản gồm 6 tới 19 chữ số"
		}
		updates["bank_account"] = nullable(v)
	}
	if req.BankAccountName != nil {
		v := strings.TrimSpace(*req.BankAccountName)
		if len([]rune(v)) > 100 {
			fields["bank_account_name"] = "Tối đa 100 ký tự"
		}
		updates["bank_account_name"] = nullable(v)
	}
	if len(fields) > 0 {
		return View{}, apperr.Validation(fields)
	}

	if len(updates) > 0 {
		if err := s.db.WithContext(ctx).Model(&Settings{ID: 1}).Updates(updates).Error; err != nil {
			return View{}, err
		}
	}
	st, err := s.Get(ctx)
	if err != nil {
		return View{}, err
	}
	view := ToView(st)
	s.hub.Publish(realtime.TopicSeller, realtime.TypeSettingsUpdated, view)
	s.menu.BroadcastAll(ctx)
	return view, nil
}

func nullable(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
