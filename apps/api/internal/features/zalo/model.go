// Package zalo liên kết một tài khoản Zalo cá nhân (quét QR) để gửi tin trạng thái đơn cho khách.
// Credentials (IMEI + cookie phiên) là toàn quyền tài khoản: trong package này chúng chỉ tồn tại dạng
// đã niêm phong bằng secrets.Cipher, không bao giờ được log hay trả ra response.
package zalo

import "time"

// Giá trị cột zalo_account.status, khớp CHECK constraint trong migration.
const (
	// StatusLinked: Zalo vẫn nhận credentials ở lần dùng gần nhất.
	StatusLinked = "linked"
	// StatusExpired: Zalo đã từ chối credentials; người bán phải quét QR lại.
	StatusExpired = "expired"
)

// accountID là khoá duy nhất của bảng: cả deployment chỉ gửi bằng một tài khoản Zalo.
const accountID int16 = 1

// Account là hàng duy nhất của zalo_account. Không có field nào chứa bản rõ credentials —
// chỉ giải mã trong bộ nhớ khi khôi phục phiên.
type Account struct {
	ID                   int16 `gorm:"primaryKey"`
	EncryptedCredentials []byte
	ZaloUID              *string
	DisplayName          *string
	Status               string
	ConsentVersion       string
	ConsentAt            time.Time
	LinkedAt             time.Time
	LastVerifiedAt       *time.Time
	UpdatedAt            time.Time
}

func (Account) TableName() string { return "zalo_account" }
