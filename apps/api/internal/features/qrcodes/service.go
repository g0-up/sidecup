package qrcodes

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"

	"sidecup/api/internal/platform/apperr"
	"sidecup/api/internal/platform/clock"
	"sidecup/api/internal/platform/ids"
	"sidecup/api/internal/platform/realtime"
)

type Publisher interface {
	Publish(topic, typ string, data any)
}

var (
	errNotFound        = apperr.NotFound("QR_NOT_FOUND", "Không tìm thấy mã QR")
	errPartnerNotFound = apperr.NotFound("PARTNER_NOT_FOUND", "Không tìm thấy quán")
)

type View struct {
	Token      string     `json:"token"`
	URL        string     `json:"url"`
	TableLabel string     `json:"table_label"`
	Active     bool       `json:"active"`
	CreatedAt  time.Time  `json:"created_at"`
	RevokedAt  *time.Time `json:"revoked_at"`
}

type CreateReq struct {
	TableLabel string `json:"table_label" validate:"required,max=50"`
}

type Service struct {
	db      *gorm.DB
	clock   clock.Clock
	hub     Publisher
	baseURL string
}

func NewService(db *gorm.DB, clk clock.Clock, hub Publisher, publicBaseURL string) *Service {
	return &Service{db: db, clock: clk, hub: hub, baseURL: publicBaseURL}
}

// URL là đường dẫn in trên thẻ; token không mang thông tin quán hay bàn.
func (s *Service) URL(token string) string { return s.baseURL + "/t/" + token }

func (s *Service) view(q QRCode) View {
	return View{Token: q.Token, URL: s.URL(q.Token), TableLabel: q.TableLabel, Active: q.Active, CreatedAt: q.CreatedAt, RevokedAt: q.RevokedAt}
}

func (s *Service) List(ctx context.Context, partnerID uuid.UUID) ([]View, error) {
	if err := s.ensurePartner(ctx, partnerID); err != nil {
		return nil, err
	}
	var qs []QRCode
	if err := s.db.WithContext(ctx).Where("partner_id = ?", partnerID).Order("active DESC, created_at").Find(&qs).Error; err != nil {
		return nil, err
	}
	out := make([]View, len(qs))
	for i, q := range qs {
		out[i] = s.view(q)
	}
	return out, nil
}

func (s *Service) Create(ctx context.Context, partnerID uuid.UUID, req CreateReq) (View, error) {
	label := strings.TrimSpace(req.TableLabel)
	if label == "" {
		return View{}, apperr.Field("table_label", "Không được để trống")
	}
	if err := s.ensurePartner(ctx, partnerID); err != nil {
		return View{}, err
	}
	for attempt := 1; ; attempt++ {
		q := QRCode{Token: ids.NewQRToken(), PartnerID: partnerID, TableLabel: label, Active: true, CreatedAt: s.clock.Now()}
		err := s.db.WithContext(ctx).Create(&q).Error
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" && attempt < 3 {
			continue
		}
		if err != nil {
			return View{}, err
		}
		return s.view(q), nil
	}
}

// Revoke idempotent: thu hồi lần hai vẫn trả 200 với mốc thu hồi đầu tiên.
// Trang menu đang mở bằng mã này nhận menu.updated {revoked:true} để chuyển sang "Mã này không còn dùng".
func (s *Service) Revoke(ctx context.Context, token string) (View, error) {
	var q QRCode
	res := s.db.WithContext(ctx).Raw(`UPDATE qr_codes SET active = false, revoked_at = COALESCE(revoked_at, ?)
		WHERE token = ? RETURNING *`, s.clock.Now(), token).Scan(&q)
	if res.Error != nil {
		return View{}, res.Error
	}
	if res.RowsAffected == 0 {
		return View{}, errNotFound
	}
	s.hub.Publish(realtime.TopicMenu(token), realtime.TypeMenuUpdated, map[string]bool{"revoked": true})
	return s.view(q), nil
}

func (s *Service) ensurePartner(ctx context.Context, id uuid.UUID) error {
	var n int64
	if err := s.db.WithContext(ctx).Table("partners").Where("id = ?", id).Count(&n).Error; err != nil {
		return err
	}
	if n == 0 {
		return errPartnerNotFound
	}
	return nil
}
