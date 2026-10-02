// Package payments trả chuỗi VietQR cho đơn để người bán đưa khách quét khi thu chuyển khoản.
package payments

import (
	"context"
	"errors"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"sidecup/api/internal/features/orders"
	"sidecup/api/internal/features/payments/vietqr"
	"sidecup/api/internal/features/settings"
	"sidecup/api/internal/platform/apperr"
	"sidecup/api/internal/platform/httpx"
)

var errBankNotConfigured = apperr.Conflict("BANK_NOT_CONFIGURED", "Chưa cài đặt tài khoản ngân hàng để nhận chuyển khoản")

type VietQRView struct {
	Payload         string `json:"payload"`
	Amount          int64  `json:"amount"`
	Purpose         string `json:"purpose"`
	BankBin         string `json:"bank_bin"`
	BankAccount     string `json:"bank_account"`
	BankAccountName string `json:"bank_account_name"`
}

type Service struct{ db *gorm.DB }

func NewService(db *gorm.DB) *Service { return &Service{db: db} }

func (s *Service) VietQR(ctx context.Context, orderID uuid.UUID) (VietQRView, error) {
	var o orders.Order
	err := s.db.WithContext(ctx).First(&o, "id = ?", orderID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return VietQRView{}, orders.ErrOrderNotFound
	}
	if err != nil {
		return VietQRView{}, err
	}
	st, err := settings.Load(ctx, s.db)
	if err != nil {
		return VietQRView{}, err
	}
	if !st.BankConfigured() {
		return VietQRView{}, errBankNotConfigured
	}
	payload, err := vietqr.Payload(*st.BankBin, *st.BankAccount, o.Total, o.Code)
	if err != nil {
		return VietQRView{}, errBankNotConfigured.With("reason", err.Error())
	}
	v := settings.ToView(st)
	return VietQRView{
		Payload: payload, Amount: o.Total, Purpose: vietqr.SanitizePurpose(o.Code),
		BankBin: v.BankBin, BankAccount: v.BankAccount, BankAccountName: v.BankAccountName,
	}, nil
}

type Handler struct{ svc *Service }

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func (h *Handler) RegisterSeller(g *gin.RouterGroup) {
	g.GET("/orders/:id/vietqr", h.vietqr)
}

func (h *Handler) vietqr(c *gin.Context) {
	id, err := httpx.ParamUUID(c, "id", orders.ErrOrderNotFound.Code, orders.ErrOrderNotFound.Message)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	v, err := h.svc.VietQR(c.Request.Context(), id)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, v)
}
