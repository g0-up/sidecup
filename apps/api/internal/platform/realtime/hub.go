// Package realtime là hub WebSocket trong tiến trình: topic → tập kết nối.
// Publisher không bao giờ bị chặn: kết nối đầy buffer bị đóng, client tự reconnect và resync qua REST.
// Hub chỉ đúng khi chạy một instance API; nhiều instance cần pub/sub ngoài (LISTEN/NOTIFY hoặc Redis).
package realtime

import (
	"encoding/json"
	"log/slog"
	"strings"
	"sync"
	"time"
)

const (
	TopicSeller = "seller"

	TypeOrderCreated    = "order.created"
	TypeOrderUpdated    = "order.updated"
	TypeSettingsUpdated = "settings.updated"
	TypeNotifierStatus  = "notifier.status"
	TypeMenuUpdated     = "menu.updated"
	TypePing            = "ping"

	sendBuffer = 32
)

func TopicOrder(id string) string   { return "order:" + id }
func TopicMenu(token string) string { return "menu:" + token }

// MenuTopicPrefix dùng để liệt kê mọi trang menu đang mở.
const MenuTopicPrefix = "menu:"

type Message struct {
	Type       string    `json:"type"`
	Data       any       `json:"data"`
	ServerTime time.Time `json:"server_time"`
}

type Hub struct {
	mu     sync.RWMutex
	topics map[string]map[*Client]struct{}
	now    func() time.Time
}

func NewHub(now func() time.Time) *Hub {
	return &Hub{topics: map[string]map[*Client]struct{}{}, now: now}
}

type Client struct {
	send      chan []byte
	done      chan struct{}
	closeOnce sync.Once
	topics    []string
	reason    string
}

// Kick báo kết nối phải đóng (buffer đầy hoặc server tắt); vòng ghi của Serve sẽ đóng socket.
func (c *Client) kick(reason string) {
	c.closeOnce.Do(func() {
		c.reason = reason
		close(c.done)
	})
}

func (h *Hub) Register(topics ...string) *Client {
	c := &Client{send: make(chan []byte, sendBuffer), done: make(chan struct{}), topics: topics}
	h.mu.Lock()
	for _, t := range topics {
		set, ok := h.topics[t]
		if !ok {
			set = map[*Client]struct{}{}
			h.topics[t] = set
		}
		set[c] = struct{}{}
	}
	h.mu.Unlock()
	return c
}

func (h *Hub) Unregister(c *Client) {
	h.mu.Lock()
	for _, t := range c.topics {
		if set, ok := h.topics[t]; ok {
			delete(set, c)
			if len(set) == 0 {
				delete(h.topics, t)
			}
		}
	}
	h.mu.Unlock()
	c.kick("unregistered")
}

// Publish gửi tới mọi kết nối của topic. Không chặn: kết nối chậm bị đóng thay vì làm chậm nghiệp vụ.
// Chỉ gọi sau khi transaction đã commit.
func (h *Hub) Publish(topic, typ string, data any) {
	b, err := json.Marshal(Message{Type: typ, Data: data, ServerTime: h.now()})
	if err != nil {
		slog.Error("realtime marshal", "type", typ, "err", err)
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.topics[topic] {
		select {
		case c.send <- b:
		default:
			c.kick("slow consumer")
		}
	}
}

// Topics liệt kê topic đang có người nghe với prefix cho trước (ví dụ mọi "menu:").
func (h *Hub) Topics(prefix string) []string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	out := make([]string, 0, len(h.topics))
	for t := range h.topics {
		if strings.HasPrefix(t, prefix) {
			out = append(out, t)
		}
	}
	return out
}

// Count trả số kết nối đang nghe topic (dùng cho test và log).
func (h *Hub) Count(topic string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.topics[topic])
}

// CloseAll đóng mọi kết nối khi tắt server; http.Server.Shutdown không chờ kết nối đã hijack.
func (h *Hub) CloseAll() {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, set := range h.topics {
		for c := range set {
			c.kick("server shutdown")
		}
	}
}
