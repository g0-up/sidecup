// Package httpx render JSON và envelope lỗi thống nhất cho mọi handler.
package httpx

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"

	"sidecup/api/internal/platform/apperr"
)

type envelope struct {
	Error *apperr.Error `json:"error"`
}

// Fail render lỗi nghiệp vụ theo status của nó; lỗi lạ thành 500 và được log kèm request id.
func Fail(c *gin.Context, err error) {
	if e, ok := apperr.As(err); ok {
		c.AbortWithStatusJSON(e.Status, envelope{Error: e})
		return
	}
	if errors.Is(err, errBodyTooLarge) {
		c.AbortWithStatusJSON(http.StatusRequestEntityTooLarge, envelope{Error: apperr.New(http.StatusRequestEntityTooLarge, "BODY_TOO_LARGE", "Dữ liệu gửi lên quá lớn")})
		return
	}
	slog.ErrorContext(c.Request.Context(), "unhandled error",
		"err", err, "path", c.FullPath(), "request_id", c.GetString(RequestIDKey))
	c.AbortWithStatusJSON(http.StatusInternalServerError, envelope{Error: apperr.New(http.StatusInternalServerError, "INTERNAL", "Có lỗi xảy ra, vui lòng thử lại")})
}

func Abort(c *gin.Context, status int, code, message string) {
	Fail(c, apperr.New(status, code, message))
}

func OK(c *gin.Context, v any)      { c.JSON(http.StatusOK, v) }
func Created(c *gin.Context, v any) { c.JSON(http.StatusCreated, v) }

// RequestIDKey là key trong gin.Context mà middleware RequestID đặt.
const RequestIDKey = "request_id"

// ClientIDKey là key trong gin.Context mà middleware ClientID đặt.
const ClientIDKey = "client_id"
