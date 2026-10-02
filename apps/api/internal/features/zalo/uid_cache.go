package zalo

import (
	"sync"
	"time"
)

const (
	uidCacheFoundTTL    = 24 * time.Hour
	uidCacheNotFoundTTL = time.Hour
	uidCacheMaxEntries  = 1000
)

type uidEntry struct {
	uid string // rỗng = đã tra mà không có tài khoản Zalo
	at  time.Time
}

// uidCache nhớ kết quả tra SĐT → uid để không gọi FindUser cho mỗi tin của cùng một khách.
// uid có thể khác giữa các tài khoản gửi, nên đổi/ngắt liên kết phải xoá sạch (reset).
type uidCache struct {
	mu      sync.Mutex
	now     func() time.Time
	entries map[string]uidEntry
	// gen tăng mỗi lần reset; kết quả tra bắt đầu trước reset không được ghi vào cache mới.
	gen uint64
}

func newUIDCache(now func() time.Time) *uidCache {
	return &uidCache{now: now, entries: make(map[string]uidEntry)}
}

// get trả (uid, true) khi có mục còn hạn; uid rỗng nghĩa là đã biết không tìm thấy.
func (c *uidCache) get(phone string) (string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.entries[phone]
	if !ok {
		return "", false
	}
	ttl := uidCacheFoundTTL
	if e.uid == "" {
		ttl = uidCacheNotFoundTTL
	}
	if c.now().Sub(e.at) >= ttl {
		delete(c.entries, phone)
		return "", false
	}
	return e.uid, true
}

func (c *uidCache) generation() uint64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.gen
}

func (c *uidCache) put(phone, uid string, gen uint64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if gen != c.gen {
		return
	}
	if _, exists := c.entries[phone]; !exists && len(c.entries) >= uidCacheMaxEntries {
		c.evictOldestLocked()
	}
	c.entries[phone] = uidEntry{uid: uid, at: c.now()}
}

func (c *uidCache) reset() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries = make(map[string]uidEntry)
	c.gen++
}

// evictOldestLocked quét tuyến tính — 1000 mục, chỉ chạy khi đầy, rẻ hơn giữ thêm một cấu trúc thứ tự.
func (c *uidCache) evictOldestLocked() {
	var oldestKey string
	var oldestAt time.Time
	first := true
	for k, e := range c.entries {
		if first || e.at.Before(oldestAt) {
			oldestKey, oldestAt, first = k, e.at, false
		}
	}
	delete(c.entries, oldestKey)
}
