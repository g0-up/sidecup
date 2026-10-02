package middleware

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func init() { gin.SetMode(gin.TestMode) }

func serve(r *gin.Engine, req *http.Request) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestLimiterAllowsBurstThenBlocks(t *testing.T) {
	l := NewLimiter(5)
	now := time.Date(2026, 10, 1, 8, 0, 0, 0, time.UTC)
	l.now = func() time.Time { return now }
	for i := range 5 {
		assert.True(t, l.Allow("ip:1"), "request %d", i+1)
	}
	assert.False(t, l.Allow("ip:1"), "request thứ 6 trong một phút bị chặn")
	assert.True(t, l.Allow("ip:2"), "key khác không bị ảnh hưởng")

	now = now.Add(12 * time.Second)
	assert.True(t, l.Allow("ip:1"), "hồi một lượt sau 12 giây")
}

func TestLimiterSweepsIdleBuckets(t *testing.T) {
	l := NewLimiter(5)
	now := time.Date(2026, 10, 1, 8, 0, 0, 0, time.UTC)
	l.now = func() time.Time { return now }
	l.Allow("a")
	l.Allow("b")
	now = now.Add(11 * time.Minute)
	l.Allow("c")
	assert.Equal(t, 1, l.size())
}

func TestRateLimitMiddlewareReturns429(t *testing.T) {
	r := gin.New()
	r.Use(RateLimit(NewLimiter(1), ByIP))
	r.GET("/", func(c *gin.Context) { c.Status(http.StatusOK) })
	assert.Equal(t, http.StatusOK, serve(r, httptest.NewRequest(http.MethodGet, "/", nil)).Code)
	w := serve(r, httptest.NewRequest(http.MethodGet, "/", nil))
	assert.Equal(t, http.StatusTooManyRequests, w.Code)
	assert.Contains(t, w.Body.String(), "RATE_LIMITED")
}

func TestClientIDRequiresUUID(t *testing.T) {
	r := gin.New()
	r.Use(ClientID())
	r.GET("/", func(c *gin.Context) { c.String(http.StatusOK, c.GetString("client_id")) })

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	assert.Equal(t, http.StatusBadRequest, serve(r, req).Code)

	req = httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set(HeaderClientID, "not-a-uuid")
	assert.Equal(t, http.StatusBadRequest, serve(r, req).Code)

	req = httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set(HeaderClientID, "7C9E6679-7425-40DE-944B-E07FC1F90AE7")
	w := serve(r, req)
	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "7c9e6679-7425-40de-944b-e07fc1f90ae7", w.Body.String())
}

func TestNotifierAuth(t *testing.T) {
	r := gin.New()
	r.Use(NotifierAuth("secret-token-123456"))
	r.GET("/", func(c *gin.Context) { c.Status(http.StatusOK) })

	for _, h := range []string{"", "Bearer wrong", "secret-token-123456", "Bearer secret-token-1234567"} {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set("Authorization", h)
		assert.Equal(t, http.StatusUnauthorized, serve(r, req).Code, h)
	}
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer secret-token-123456")
	assert.Equal(t, http.StatusOK, serve(r, req).Code)
}

func TestSellerAuth(t *testing.T) {
	r := gin.New()
	r.Use(SellerAuth("sc_session", func(raw string) error {
		if raw == "good" {
			return nil
		}
		return errors.New("bad")
	}))
	r.GET("/", func(c *gin.Context) { c.Status(http.StatusOK) })

	assert.Equal(t, http.StatusUnauthorized, serve(r, httptest.NewRequest(http.MethodGet, "/", nil)).Code)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(&http.Cookie{Name: "sc_session", Value: "bad"})
	w := serve(r, req)
	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Contains(t, w.Body.String(), "UNAUTHENTICATED")

	req = httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(&http.Cookie{Name: "sc_session", Value: "good"})
	assert.Equal(t, http.StatusOK, serve(r, req).Code)
}

func TestRecoverReturnsEnvelope(t *testing.T) {
	r := gin.New()
	r.Use(RequestID(), Recover())
	r.GET("/", func(*gin.Context) { panic("boom") })
	w := serve(r, httptest.NewRequest(http.MethodGet, "/", nil))
	assert.Equal(t, http.StatusInternalServerError, w.Code)
	assert.Contains(t, w.Body.String(), `"code":"INTERNAL"`)
	assert.NotEmpty(t, w.Header().Get(HeaderRequestID))
}
