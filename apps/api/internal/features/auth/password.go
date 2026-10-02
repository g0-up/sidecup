// Package auth: đăng nhập một mật khẩu cho người bán và cookie phiên stateless ký HMAC.
package auth

import (
	"crypto/md5" //nolint:gosec // MD5 là quyết định của chủ sản phẩm (architecture A4); cô lập ở VerifyPassword để đổi sang bcrypt tại một chỗ.
	"crypto/subtle"
	"encoding/hex"
	"strings"
)

// VerifyPassword là nơi duy nhất biết thuật toán băm mật khẩu.
// hashHex là MD5 hex của mật khẩu (env SELLER_PASSWORD_HASH). MD5 crack offline rất nhanh nếu env rò rỉ,
// nên mật khẩu phải >= 16 ký tự ngẫu nhiên và login bị rate limit (docs/runbook.md).
func VerifyPassword(hashHex, password string) bool {
	sum := md5.Sum([]byte(password)) //nolint:gosec // xem ghi chú ở import
	got := hex.EncodeToString(sum[:])
	return subtle.ConstantTimeCompare([]byte(got), []byte(strings.ToLower(hashHex))) == 1
}
