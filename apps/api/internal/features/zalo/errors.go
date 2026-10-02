package zalo

import (
	"errors"
	"net/http"

	"sidecup/api/internal/platform/apperr"
)

var (
	// ErrNotLinked: chưa có tài khoản Zalo nào được liên kết.
	ErrNotLinked = apperr.Conflict("ZALO_NOT_LINKED", "Chưa liên kết Zalo")
	// ErrLinkExpired: có credentials nhưng Zalo không còn nhận (hoặc không giải mã được vì đổi key) —
	// cách sửa duy nhất là quét QR lại.
	ErrLinkExpired = apperr.Conflict("ZALO_EXPIRED", "Phiên Zalo đã hết hạn, vui lòng quét lại mã QR")
	// ErrLinkNotFound: link id không còn trong bộ nhớ (đã quá hạn, bị thay thế, hoặc chưa từng cấp).
	ErrLinkNotFound = apperr.NotFound("ZALO_LINK_NOT_FOUND", "Phiên quét mã đã hết hạn, vui lòng thử lại")
	// ErrConsentRequired: chưa xác nhận đồng ý thì không bắt đầu đăng nhập.
	ErrConsentRequired = apperr.Field("consent_version", "Cần đồng ý trước khi liên kết Zalo")
	// ErrNotConfigured: máy chủ không có ZALO_CREDENTIAL_KEY nên tính năng tắt.
	ErrNotConfigured = apperr.New(http.StatusServiceUnavailable, "ZALO_NOT_CONFIGURED", "Chưa cấu hình Zalo trên máy chủ")

	// ErrRecipientNotFound: SĐT không tra ra tài khoản Zalo (không dùng Zalo hoặc chặn tìm theo SĐT).
	// Lỗi vĩnh viễn — gửi lại cũng không khác.
	ErrRecipientNotFound = errors.New("zalo: không tìm thấy người nhận")
)

// errAccountNotFound là trạng thái bình thường khi chưa quét QR, không phải sự cố.
var errAccountNotFound = errors.New("zalo: chưa có tài khoản")
