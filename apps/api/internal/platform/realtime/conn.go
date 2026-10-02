package realtime

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/coder/websocket"
)

const (
	pingInterval = 30 * time.Second
	pongWait     = 30 * time.Second
	writeTimeout = 10 * time.Second

	// Mã đóng riêng của ứng dụng (4000–4999) để client phân biệt với lỗi mạng.
	CloseUnauthorized websocket.StatusCode = 4401
	CloseForbidden    websocket.StatusCode = 4403
)

// Accept nâng cấp kết nối; Origin phải trùng Host hoặc khớp originPatterns (chống CSWSH).
func Accept(w http.ResponseWriter, r *http.Request, originPatterns []string) (*websocket.Conn, error) {
	return websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: originPatterns})
}

// Serve giữ kết nối tới khi client đóng, ping thất bại, hoặc hub kick. Client chỉ nhận, không gửi.
func (h *Hub) Serve(ctx context.Context, conn *websocket.Conn, c *Client) {
	defer h.Unregister(c)
	ctx, cancel := context.WithCancel(conn.CloseRead(ctx))
	defer cancel()

	// Ping giao thức phát hiện client chết; message "ping" ứng dụng cho client biết server còn sống
	// (trình duyệt không cho JS thấy ping/pong giao thức).
	go func() {
		t := time.NewTicker(pingInterval)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				pctx, pcancel := context.WithTimeout(ctx, pongWait)
				err := conn.Ping(pctx)
				pcancel()
				if err != nil {
					cancel()
					return
				}
				b, _ := json.Marshal(Message{Type: TypePing, ServerTime: h.now()})
				select {
				case c.send <- b:
				default:
				}
			}
		}
	}()

	for {
		select {
		case <-ctx.Done():
			_ = conn.CloseNow()
			return
		case <-c.done:
			status := websocket.StatusTryAgainLater
			if c.reason == "server shutdown" {
				status = websocket.StatusGoingAway
			}
			_ = conn.Close(status, c.reason)
			return
		case b := <-c.send:
			wctx, wcancel := context.WithTimeout(ctx, writeTimeout)
			err := conn.Write(wctx, websocket.MessageText, b)
			wcancel()
			if err != nil {
				if !errors.Is(err, context.Canceled) {
					slog.Debug("realtime write", "err", err)
				}
				_ = conn.CloseNow()
				return
			}
		}
	}
}
