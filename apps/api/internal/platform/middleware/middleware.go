// Package middleware chứa các lớp Gin dùng chung: request id, log, recover, client id, rate limit, xác thực.
package middleware

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"log/slog"
	"net/http"
	"runtime/debug"
	"slices"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"sidecup/api/internal/platform/apperr"
	"sidecup/api/internal/platform/httpx"
)

const HeaderRequestID = "X-Request-Id"

func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader(HeaderRequestID)
		if id == "" || len(id) > 64 {
			var b [8]byte
			_, _ = rand.Read(b[:])
			id = hex.EncodeToString(b[:])
		}
		c.Set(httpx.RequestIDKey, id)
		c.Header(HeaderRequestID, id)
		c.Next()
	}
}

// Logger ghi một dòng JSON mỗi request. Không log body, cookie hay Authorization.
func Logger(skipPaths ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if slices.Contains(skipPaths, c.Request.URL.Path) {
			c.Next()
			return
		}
		start := time.Now()
		c.Next()
		status := c.Writer.Status()
		level := slog.LevelInfo
		switch {
		case status >= 500:
			level = slog.LevelError
		case status >= 400:
			level = slog.LevelWarn
		}
		route := c.FullPath()
		if route == "" {
			route = "unmatched"
		}
		slog.Log(c.Request.Context(), level, "http",
			"method", c.Request.Method,
			"route", route,
			"status", status,
			"latency_ms", time.Since(start).Milliseconds(),
			"request_id", c.GetString(httpx.RequestIDKey),
			"client_id", c.GetString(httpx.ClientIDKey),
		)
	}
}

func Recover() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				if err, ok := r.(error); ok && errors.Is(err, http.ErrAbortHandler) {
					panic(r)
				}
				slog.Error("panic", "panic", r, "stack", string(debug.Stack()), "request_id", c.GetString(httpx.RequestIDKey))
				if !c.Writer.Written() {
					httpx.Abort(c, http.StatusInternalServerError, "INTERNAL", "Có lỗi xảy ra, vui lòng thử lại")
				} else {
					c.Abort()
				}
			}
		}()
		c.Next()
	}
}

const HeaderClientID = "X-Client-Id"

// ClientID bắt buộc header X-Client-Id dạng UUID (danh tính thiết bị, không phải PII).
func ClientID() gin.HandlerFunc {
	return func(c *gin.Context) {
		raw := c.GetHeader(HeaderClientID)
		id, err := uuid.Parse(raw)
		if err != nil {
			httpx.Fail(c, apperr.BadRequest("CLIENT_ID_REQUIRED", "Thiếu mã thiết bị, vui lòng tải lại trang"))
			return
		}
		c.Set(httpx.ClientIDKey, id.String())
		c.Next()
	}
}

// SellerAuth chặn request không có cookie phiên hợp lệ. verify nhận giá trị cookie thô.
func SellerAuth(cookieName string, verify func(raw string) error) gin.HandlerFunc {
	return func(c *gin.Context) {
		raw, err := c.Cookie(cookieName)
		if err != nil || verify(raw) != nil {
			httpx.Fail(c, apperr.New(http.StatusUnauthorized, "UNAUTHENTICATED", "Phiên đăng nhập đã hết, vui lòng đăng nhập lại"))
			return
		}
		c.Next()
	}
}

// NotifierAuth so bearer token bằng constant-time để không lộ token qua thời gian phản hồi.
func NotifierAuth(token string) gin.HandlerFunc {
	want := []byte(token)
	return func(c *gin.Context) {
		got, ok := strings.CutPrefix(c.GetHeader("Authorization"), "Bearer ")
		if !ok || subtle.ConstantTimeCompare([]byte(got), want) != 1 {
			httpx.Fail(c, apperr.New(http.StatusUnauthorized, "UNAUTHENTICATED", "Sai token"))
			return
		}
		c.Next()
	}
}

// CORS chỉ bật ở dev khi web không đi qua proxy của Vite.
func CORS(origins []string) gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" && slices.Contains(origins, origin) {
			h := c.Writer.Header()
			h.Set("Access-Control-Allow-Origin", origin)
			h.Set("Access-Control-Allow-Credentials", "true")
			h.Set("Access-Control-Allow-Headers", "Content-Type, X-Client-Id, Idempotency-Key, X-Request-Id")
			h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			h.Add("Vary", "Origin")
			if c.Request.Method == http.MethodOptions {
				c.AbortWithStatus(http.StatusNoContent)
				return
			}
		}
		c.Next()
	}
}
