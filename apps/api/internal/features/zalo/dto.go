package zalo

import (
	"encoding/base64"
	"time"
)

// StatusView trả cho trang Cài đặt; không field nào mang credentials.
type StatusView struct {
	Configured  bool       `json:"configured"`
	Linked      bool       `json:"linked"`
	Status      string     `json:"status"`
	DisplayName string     `json:"display_name"`
	LinkedAt    *time.Time `json:"linked_at"`
}

func toStatusView(st AccountStatus) StatusView {
	v := StatusView{Configured: true, Linked: st.Linked, Status: st.Status, DisplayName: st.DisplayName}
	if st.Linked {
		at := st.LinkedAt
		v.LinkedAt = &at
	}
	return v
}

type LinkReq struct {
	ConsentVersion string `json:"consent_version" validate:"required,max=64"`
}

type LinkStartView struct {
	LinkID string `json:"link_id"`
}

type LinkView struct {
	LinkID      string `json:"link_id"`
	State       string `json:"state"`
	QRPNGBase64 string `json:"qr_png_base64,omitempty"`
	DisplayName string `json:"display_name,omitempty"`
	Failure     string `json:"failure,omitempty"`
}

func toLinkView(s LinkSnapshot) LinkView {
	v := LinkView{LinkID: s.LinkID.String(), State: string(s.State), DisplayName: s.DisplayName, Failure: s.Failure}
	if len(s.QRPNG) > 0 {
		v.QRPNGBase64 = base64.StdEncoding.EncodeToString(s.QRPNG)
	}
	return v
}
