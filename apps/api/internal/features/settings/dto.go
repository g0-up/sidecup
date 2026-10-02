package settings

import "time"

type View struct {
	AcceptingOrders bool      `json:"accepting_orders"`
	EtaMinutes      int       `json:"eta_minutes"`
	BankBin         string    `json:"bank_bin"`
	BankAccount     string    `json:"bank_account"`
	BankAccountName string    `json:"bank_account_name"`
	UpdatedAt       time.Time `json:"updated_at"`
}

func ToView(s Settings) View {
	return View{
		AcceptingOrders: s.AcceptingOrders,
		EtaMinutes:      s.EtaMinutes,
		BankBin:         deref(s.BankBin),
		BankAccount:     deref(s.BankAccount),
		BankAccountName: deref(s.BankAccountName),
		UpdatedAt:       s.UpdatedAt,
	}
}

// UpdateReq là cập nhật từng phần: field vắng mặt giữ nguyên; chuỗi rỗng xoá thông tin ngân hàng.
type UpdateReq struct {
	AcceptingOrders *bool   `json:"accepting_orders"`
	EtaMinutes      *int    `json:"eta_minutes"`
	BankBin         *string `json:"bank_bin"`
	BankAccount     *string `json:"bank_account"`
	BankAccountName *string `json:"bank_account_name"`
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
