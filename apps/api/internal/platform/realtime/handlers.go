package realtime

import (
	"context"
	"log/slog"

	"github.com/gin-gonic/gin"
)

// SellerHandler phục vụ GET /ws/seller; route phải nằm sau middleware SellerAuth.
func SellerHandler(h *Hub, originPatterns []string) gin.HandlerFunc {
	return func(c *gin.Context) {
		conn, err := Accept(c.Writer, c.Request, originPatterns)
		if err != nil {
			slog.Warn("ws seller accept", "err", err)
			return
		}
		h.Serve(c.Request.Context(), conn, h.Register(TopicSeller))
	}
}

// CustomerAuthorizer quyết định trang khách được nghe topic nào (kiểm client_id khớp đơn, QR còn hiệu lực).
type CustomerAuthorizer interface {
	CustomerTopics(ctx context.Context, clientID, orderID, token string) ([]string, error)
}

// CustomerHandler phục vụ GET /ws/customer?client_id=&order=&token=.
// Không có cookie; sai quyền thì vẫn nâng cấp rồi đóng với mã 4403 để client ngừng thử lại.
func CustomerHandler(h *Hub, auth CustomerAuthorizer, originPatterns []string) gin.HandlerFunc {
	return func(c *gin.Context) {
		conn, err := Accept(c.Writer, c.Request, originPatterns)
		if err != nil {
			slog.Warn("ws customer accept", "err", err)
			return
		}
		topics, err := auth.CustomerTopics(c.Request.Context(), c.Query("client_id"), c.Query("order"), c.Query("token"))
		if err != nil || len(topics) == 0 {
			_ = conn.Close(CloseForbidden, "forbidden")
			return
		}
		h.Serve(c.Request.Context(), conn, h.Register(topics...))
	}
}
