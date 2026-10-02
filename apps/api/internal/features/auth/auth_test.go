package auth

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"sidecup/api/internal/platform/clock"
	"sidecup/api/internal/platform/middleware"
)

// md5("password") — vector chuẩn.
const passwordMD5 = "5f4dcc3b5aa765d61d8327deb882cf99"

var secret = []byte("0123456789abcdef0123456789abcdef")

func TestVerifyPassword(t *testing.T) {
	assert.True(t, VerifyPassword(passwordMD5, "password"))
	assert.True(t, VerifyPassword(strings.ToUpper(passwordMD5), "password"))
	assert.False(t, VerifyPassword(passwordMD5, "Password"))
	assert.False(t, VerifyPassword(passwordMD5, ""))
	assert.False(t, VerifyPassword("", "password"))
}

func TestSessionRoundTripAndExpiry(t *testing.T) {
	now := time.Date(2026, 10, 1, 8, 0, 0, 0, time.UTC)
	raw, sess := Sign(now, time.Hour, secret)
	got, err := Verify(raw, now.Add(59*time.Minute), secret)
	require.NoError(t, err)
	assert.Equal(t, sess, got)

	_, err = Verify(raw, now.Add(time.Hour), secret)
	assert.ErrorIs(t, err, ErrSessionExpired)

	_, err = Verify(raw, now, []byte("another-secret-another-secret-xx"))
	assert.ErrorIs(t, err, ErrSessionInvalid, "đổi secret thu hồi mọi phiên")
}

func TestSessionRejectsTampering(t *testing.T) {
	now := time.Date(2026, 10, 1, 8, 0, 0, 0, time.UTC)
	raw, _ := Sign(now, time.Hour, secret)
	p, sig, _ := strings.Cut(raw, ".")
	forged, _ := Sign(now, 365*24*time.Hour, []byte("attacker-secret-attacker-secret-"))
	fp, _, _ := strings.Cut(forged, ".")

	for _, bad := range []string{"", ".", p, p + ".", "." + sig, fp + "." + sig, p + "." + sig + "x", "a.b.c"} {
		_, err := Verify(bad, now, secret)
		assert.ErrorIs(t, err, ErrSessionInvalid, bad)
	}
}

func newRouter(clk clock.Clock) *gin.Engine {
	gin.SetMode(gin.TestMode)
	svc := NewService(passwordMD5, string(secret), clk)
	h := NewHandler(svc, true)
	r := gin.New()
	api := r.Group("/api")
	h.RegisterPublic(api, middleware.RateLimit(middleware.NewLimiter(5), middleware.ByIP))
	seller := api.Group("/seller", middleware.SellerAuth(CookieName, svc.VerifyCookie))
	h.RegisterSeller(seller)
	return r
}

func do(r *gin.Engine, method, path, body string, cookies ...*http.Cookie) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	for _, c := range cookies {
		req.AddCookie(c)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestLoginFlow(t *testing.T) {
	clk := clock.NewFake(time.Date(2026, 10, 1, 8, 0, 0, 0, time.UTC), time.UTC)
	r := newRouter(clk)

	w := do(r, http.MethodPost, "/api/seller/login", `{"password":"wrong"}`)
	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Contains(t, w.Body.String(), "INVALID_PASSWORD")

	w = do(r, http.MethodPost, "/api/seller/login", `{"password":"password"}`)
	require.Equal(t, http.StatusOK, w.Code)
	cookies := w.Result().Cookies()
	require.Len(t, cookies, 1)
	ck := cookies[0]
	assert.Equal(t, CookieName, ck.Name)
	assert.True(t, ck.HttpOnly)
	assert.True(t, ck.Secure)
	assert.Equal(t, http.SameSiteLaxMode, ck.SameSite)

	assert.Equal(t, http.StatusOK, do(r, http.MethodGet, "/api/seller/me", "", ck).Code)
	w = do(r, http.MethodGet, "/api/seller/me", "")
	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Contains(t, w.Body.String(), "UNAUTHENTICATED")

	clk.Advance(SessionTTL)
	assert.Equal(t, http.StatusUnauthorized, do(r, http.MethodGet, "/api/seller/me", "", ck).Code, "cookie hết hạn sau 30 ngày")

	w = do(r, http.MethodPost, "/api/seller/logout", "")
	assert.Equal(t, http.StatusNoContent, w.Code)
	assert.Equal(t, -1, w.Result().Cookies()[0].MaxAge)
}

func TestLoginRateLimitedAfterFiveAttempts(t *testing.T) {
	r := newRouter(clock.NewReal(time.UTC))
	for i := range 5 {
		w := do(r, http.MethodPost, "/api/seller/login", `{"password":"wrong"}`)
		assert.Equal(t, http.StatusUnauthorized, w.Code, "lần %d", i+1)
	}
	w := do(r, http.MethodPost, "/api/seller/login", `{"password":"password"}`)
	assert.Equal(t, http.StatusTooManyRequests, w.Code, "lần 6 trong một phút bị chặn kể cả đúng mật khẩu")
}
