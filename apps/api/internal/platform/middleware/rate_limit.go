package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"

	"sidecup/api/internal/platform/apperr"
	"sidecup/api/internal/platform/httpx"
)

// Limiter giữ một token bucket cho mỗi key, trong bộ nhớ (một instance API).
// Bucket không dùng quá idleTTL bị dọn khi có request tới, nên map không phình vô hạn.
type Limiter struct {
	mu        sync.Mutex
	every     rate.Limit
	burst     int
	buckets   map[string]*bucket
	idleTTL   time.Duration
	lastSweep time.Time
	now       func() time.Time
}

type bucket struct {
	lim      *rate.Limiter
	lastSeen time.Time
}

// NewLimiter cho phép `perMinute` request mỗi phút, dồn tối đa `perMinute` request liền nhau.
func NewLimiter(perMinute int) *Limiter {
	return &Limiter{
		every:   rate.Every(time.Minute / time.Duration(perMinute)),
		burst:   perMinute,
		buckets: map[string]*bucket{},
		idleTTL: 10 * time.Minute,
		now:     time.Now,
	}
}

func (l *Limiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	if now.Sub(l.lastSweep) > time.Minute {
		for k, b := range l.buckets {
			if now.Sub(b.lastSeen) > l.idleTTL {
				delete(l.buckets, k)
			}
		}
		l.lastSweep = now
	}
	b, ok := l.buckets[key]
	if !ok {
		b = &bucket{lim: rate.NewLimiter(l.every, l.burst)}
		l.buckets[key] = b
	}
	b.lastSeen = now
	return b.lim.AllowN(now, 1)
}

func (l *Limiter) size() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.buckets)
}

// RateLimit trả 429 khi key vượt hạn mức. key rỗng thì bỏ qua (không giới hạn).
func RateLimit(l *Limiter, keyFn func(*gin.Context) string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if key := keyFn(c); key != "" && !l.Allow(key) {
			c.Header("Retry-After", "60")
			httpx.Fail(c, apperr.New(http.StatusTooManyRequests, "RATE_LIMITED", "Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút"))
			return
		}
		c.Next()
	}
}

func ByIP(c *gin.Context) string       { return "ip:" + c.ClientIP() }
func ByClientID(c *gin.Context) string { return "client:" + c.GetString(httpx.ClientIDKey) }
