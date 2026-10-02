package menu

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"sidecup/api/internal/features/partners"
	"sidecup/api/internal/features/products"
	"sidecup/api/internal/features/qrcodes"
	"sidecup/api/internal/features/settings"
	"sidecup/api/internal/platform/apperr"
)

var (
	ErrQRNotFound = apperr.NotFound("QR_NOT_FOUND", "Không tìm thấy mã này")
	// Trang menu trả 410 để web chuyển sang "Mã này không còn dùng"; POST đơn dùng 409 cùng code.
	errQRRevokedGone     = apperr.New(http.StatusGone, "QR_REVOKED", "Mã này không còn dùng")
	ErrQRRevokedConflict = apperr.Conflict("QR_REVOKED", "Mã này không còn dùng")
)

// Table là mọi thứ cần để hiện menu hoặc nhận đơn tại một bàn.
type Table struct {
	QR       qrcodes.QRCode
	Partner  partners.Partner
	Settings settings.Settings
	Products []products.Product // đã bỏ món ẩn của quán, sắp theo sort
}

// LoadQR trả lỗi 404 khi token không tồn tại; caller tự quyết xử lý QR đã thu hồi.
func LoadQR(ctx context.Context, tx *gorm.DB, token string) (qrcodes.QRCode, error) {
	var qr qrcodes.QRCode
	err := tx.WithContext(ctx).First(&qr, "token = ?", token).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return qr, ErrQRNotFound
	}
	return qr, err
}

// LoadTable dùng chung cho GET menu và POST đơn (orders gọi trong transaction của nó).
func LoadTable(ctx context.Context, tx *gorm.DB, qr qrcodes.QRCode) (Table, error) {
	t := Table{QR: qr}
	tx = tx.WithContext(ctx)
	if err := tx.First(&t.Partner, "id = ?", qr.PartnerID).Error; err != nil {
		return t, err
	}
	st, err := settings.Load(ctx, tx)
	if err != nil {
		return t, err
	}
	t.Settings = st
	ps, err := VisibleProducts(ctx, tx, qr.PartnerID)
	if err != nil {
		return t, err
	}
	t.Products = ps
	return t, nil
}

func VisibleProducts(ctx context.Context, tx *gorm.DB, partnerID uuid.UUID) ([]products.Product, error) {
	var ps []products.Product
	err := tx.WithContext(ctx).
		Where("id NOT IN (SELECT product_id FROM partner_hidden_products WHERE partner_id = ?)", partnerID).
		Order("sort, name").Find(&ps).Error
	return ps, err
}

type myOrder struct {
	ID     uuid.UUID `json:"id"`
	Code   string    `json:"code"`
	Status string    `json:"status"`
}

// myOrders: đơn của thiết bị này tại bàn này trong ngày (theo APP_TZ), để quét lại thấy lối vào đơn đang chạy.
func myOrders(ctx context.Context, tx *gorm.DB, token, clientID string, since time.Time) ([]myOrder, error) {
	out := []myOrder{}
	err := tx.WithContext(ctx).Table("orders").Select("id, code, status").
		Where("qr_token = ? AND client_id = ? AND created_at >= ?", token, clientID, since).
		Order("created_at DESC").Limit(5).Scan(&out).Error
	return out, err
}

func recordPageView(ctx context.Context, tx *gorm.DB, token, clientID string, day, now time.Time) error {
	return tx.WithContext(ctx).Exec(`INSERT INTO page_views (qr_token, day, client_id, first_seen_at)
		VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING`, token, day.Format(time.DateOnly), clientID, now).Error
}
