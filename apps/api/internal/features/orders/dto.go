package orders

import (
	"net/url"
	"time"

	"github.com/google/uuid"
)

// OrderView là phần đơn mà cả khách lẫn người bán đều thấy: không SĐT, không client_id.
type OrderView struct {
	ID            uuid.UUID  `json:"id"`
	Code          string     `json:"code"`
	Status        Status     `json:"status"`
	Items         OrderItems `json:"items"`
	Note          *string    `json:"note"`
	Total         int64      `json:"total"`
	PartnerName   string     `json:"partner_name"`
	TableLabel    string     `json:"table_label"`
	CancelReason  *string    `json:"cancel_reason"`
	PaymentMethod *string    `json:"payment_method"`
	CreatedAt     time.Time  `json:"created_at"`
	AcceptedAt    *time.Time `json:"accepted_at"`
	DeliveringAt  *time.Time `json:"delivering_at"`
	PaidAt        *time.Time `json:"paid_at"`
	ClosedAt      *time.Time `json:"closed_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
	// MenuPath là đường tương đối về menu của bàn, để trang đơn có nút gọi thêm; origin web tự ghép.
	MenuPath string `json:"menu_path"`
}

// PublicView là thứ khách (và ai có UUID đơn) thấy: đơn kèm thời gian pha dự kiến và việc khách
// có nhận tin Zalo hay không. Chỉ có cờ notify_zalo, không bao giờ có SĐT.
type PublicView struct {
	OrderView
	EtaMinutes int  `json:"eta_minutes"`
	NotifyZalo bool `json:"notify_zalo"`
}

// SellerView thêm SĐT và dữ liệu hoa hồng; chỉ trả sau khi người bán đăng nhập.
type SellerView struct {
	OrderView
	PartnerID        uuid.UUID `json:"partner_id"`
	QRToken          string    `json:"qr_token"`
	CustomerPhone    *string   `json:"customer_phone"`
	CommissionRate   *float64  `json:"commission_rate"`
	CommissionAmount *int64    `json:"commission_amount"`
}

func toView(o Order) OrderView {
	items := o.Items
	if items == nil {
		items = OrderItems{}
	}
	return OrderView{
		ID: o.ID, Code: o.Code, Status: o.Status, Items: items, Note: o.Note, Total: o.Total,
		PartnerName: o.PartnerName, TableLabel: o.TableLabel, CancelReason: o.CancelReason, PaymentMethod: o.PaymentMethod,
		CreatedAt: o.CreatedAt, AcceptedAt: o.AcceptedAt, DeliveringAt: o.DeliveringAt, PaidAt: o.PaidAt,
		ClosedAt: o.ClosedAt, UpdatedAt: o.UpdatedAt, MenuPath: "/t/" + url.PathEscape(o.QRToken),
	}
}

// ToPublic ghép view của khách; etaMinutes và notifyZalo do service đọc từ cài đặt và liên kết Zalo.
func ToPublic(o Order, etaMinutes int, notifyZalo bool) PublicView {
	return PublicView{OrderView: toView(o), EtaMinutes: etaMinutes, NotifyZalo: notifyZalo}
}

func ToSeller(o Order) SellerView {
	v := SellerView{OrderView: toView(o), PartnerID: o.PartnerID, QRToken: o.QRToken, CustomerPhone: o.CustomerPhone, CommissionAmount: o.CommissionAmount}
	if o.CommissionRate.Valid {
		r, _ := o.CommissionRate.Decimal.Float64()
		v.CommissionRate = &r
	}
	return v
}

type publicResp struct {
	PublicView
	ServerTime time.Time `json:"server_time"`
}

type sellerResp struct {
	SellerView
	ServerTime time.Time `json:"server_time"`
}

type listResp struct {
	Orders     []SellerView `json:"orders"`
	ServerTime time.Time    `json:"server_time"`
}

type CreateReq struct {
	Items []LineReq `json:"items" validate:"required,min=1,max=30,dive"`
	Note  *string   `json:"note" validate:"omitempty,max=200"`
	// Phone không bắt buộc: bỏ trống thì khách không nhận tin trạng thái đơn qua Zalo.
	Phone string `json:"phone" validate:"omitempty,max=20"`
}

type TransitionReq struct {
	To            Status `json:"to" validate:"required,oneof=accepted rejected delivering paid failed"`
	ExpectedFrom  Status `json:"expected_from" validate:"required,oneof=sent accepted delivering"`
	PaymentMethod string `json:"payment_method" validate:"omitempty,oneof=cash transfer"`
	Reason        string `json:"reason" validate:"omitempty,max=200"`
}
