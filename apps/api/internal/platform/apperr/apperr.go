// Package apperr là lỗi nghiệp vụ mang sẵn HTTP status, mã máy đọc và câu tiếng Việt cho người dùng.
// Service trả *Error; httpx render thành envelope {"error": {...}} mà không cần service biết Gin.
package apperr

import (
	"errors"
	"net/http"
)

type Error struct {
	Status  int            `json:"-"`
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}

func (e *Error) Error() string { return e.Code + ": " + e.Message }

func (e *Error) With(key string, value any) *Error {
	cp := *e
	cp.Details = make(map[string]any, len(e.Details)+1)
	for k, v := range e.Details {
		cp.Details[k] = v
	}
	cp.Details[key] = value
	return &cp
}

func New(status int, code, message string) *Error {
	return &Error{Status: status, Code: code, Message: message}
}

func NotFound(code, message string) *Error { return New(http.StatusNotFound, code, message) }
func Conflict(code, message string) *Error { return New(http.StatusConflict, code, message) }
func Forbidden(code, message string) *Error {
	return New(http.StatusForbidden, code, message)
}
func BadRequest(code, message string) *Error {
	return New(http.StatusBadRequest, code, message)
}

// Validation gom lỗi theo field (tên field theo JSON) để web hiển thị ngay dưới ô nhập.
func Validation(fields map[string]string) *Error {
	return &Error{
		Status:  http.StatusUnprocessableEntity,
		Code:    "VALIDATION",
		Message: "Dữ liệu chưa hợp lệ",
		Details: map[string]any{"fields": fields},
	}
}

func Field(field, message string) *Error {
	return Validation(map[string]string{field: message})
}

func As(err error) (*Error, bool) {
	var e *Error
	ok := errors.As(err, &e)
	return e, ok
}
