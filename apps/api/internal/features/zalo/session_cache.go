package zalo

import (
	"sync"

	"sidecup/api/internal/features/zalo/protocol"
)

// sessionCache giữ phiên Zalo đang sống để khôi phục từ credentials chỉ tốn một lần login.
// Phiên là *http.Client kèm cookie jar, không chia sẻ được giữa process — giả định API chạy một replica.
// Mọi thứ trong cache đều dựng lại được từ credentials đã lưu, nên bỏ phiên chỉ tốn một lần login lại.
type sessionCache struct {
	mu   sync.RWMutex
	sess *protocol.Session
	// evictions đếm số lần phiên bị bỏ hoặc bị thay. Khôi phục phiên mất một vòng mạng và ngắt kết nối hay
	// liên kết lại có thể chen vào giữa; đọc bộ đếm trước khi khôi phục rồi so lại lúc lưu là cách nhận ra
	// kết quả đó — phiên mới hay lời từ chối — không còn thuộc về tài khoản hiện tại.
	evictions uint64
}

func (c *sessionCache) get() (*protocol.Session, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.sess, c.sess != nil
}

// replace đặt phiên của một liên kết mới. Tăng bộ đếm như evict: login nào bắt đầu trước đó đều dùng
// credentials cũ, kết quả của nó không được ghi đè phiên mới hay đánh dấu hàng mới hết hạn.
func (c *sessionCache) replace(sess *protocol.Session) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.sess = sess
	c.evictions++
}

// evict được gọi mỗi khi phiên hết đáng tin: ngắt kết nối, login lại bị từ chối, kiểm tra sức khoẻ.
func (c *sessionCache) evict() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.sess = nil
	c.evictions++
}

func (c *sessionCache) evictionCount() uint64 {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.evictions
}

// putUnlessEvicted chỉ lưu khi chưa có lần evict nào kể từ lúc đọc since. Xoá hàng trong DB không thu hồi
// gì phía Zalo, nên một login bắt đầu trước khi ngắt kết nối vẫn thành công sau đó; thiếu kiểm tra này
// cache sẽ giữ phiên dùng được của tài khoản người bán vừa rút đồng ý.
func (c *sessionCache) putUnlessEvicted(sess *protocol.Session, since uint64) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.evictions != since {
		return false
	}
	c.sess = sess
	return true
}

// evictIfUnchanged bỏ phiên chỉ khi chưa có gì thay đổi kể từ since; false nghĩa là ngắt kết nối hoặc liên kết
// lại đã chen vào, nên lỗi vừa gặp thuộc về tài khoản cũ.
func (c *sessionCache) evictIfUnchanged(since uint64) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.evictions != since {
		return false
	}
	c.sess = nil
	c.evictions++
	return true
}
