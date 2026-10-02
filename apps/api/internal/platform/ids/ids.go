// Package ids sinh token QR và mã đơn ngẫu nhiên bằng crypto/rand.
package ids

import (
	"crypto/rand"
	"math/big"
)

// Alphabet bỏ các ký tự dễ nhầm khi đọc to hoặc in nhỏ: 0/O, 1/I/L.
const Alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

const (
	QRTokenLength   = 12
	OrderCodeLength = 6
)

// NewQRToken không mang thông tin quán hay bàn; chỉ tra được qua DB.
func NewQRToken() string { return random(QRTokenLength) }

func NewOrderCode() string { return random(OrderCodeLength) }

func random(n int) string {
	max := big.NewInt(int64(len(Alphabet)))
	b := make([]byte, n)
	for i := range b {
		idx, err := rand.Int(rand.Reader, max)
		if err != nil {
			// crypto/rand chỉ lỗi khi hệ điều hành hỏng nguồn entropy; không có cách phục hồi an toàn.
			panic("ids: crypto/rand unavailable: " + err.Error())
		}
		b[i] = Alphabet[idx.Int64()]
	}
	return string(b)
}
