package notifications

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"sidecup/api/internal/platform/httpx"
)

type Handler struct{ svc *Service }

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// RegisterInternal gắn vào nhóm /internal (bearer NOTIFIER_TOKEN); reverse proxy không mở nhóm này ra Internet.
func (h *Handler) RegisterInternal(g *gin.RouterGroup) {
	g.GET("/notifications/pending", h.pending)
	g.POST("/notifications/:id/ack", h.ack)
	g.POST("/notifier/heartbeat", h.heartbeat)
}

func (h *Handler) RegisterSeller(g *gin.RouterGroup) {
	g.GET("/notifier/status", h.status)
}

func (h *Handler) pending(c *gin.Context) {
	limit, _ := strconv.Atoi(c.Query("limit"))
	items, err := h.svc.Claim(c.Request.Context(), limit)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, gin.H{"notifications": items})
}

func (h *Handler) ack(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		httpx.Fail(c, errNotFound)
		return
	}
	var req AckReq
	if err := httpx.BindJSON(c, &req); err != nil {
		httpx.Fail(c, err)
		return
	}
	out, err := h.svc.Ack(c.Request.Context(), id, *req.OK, req.Error)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, out)
}

func (h *Handler) heartbeat(c *gin.Context) {
	var req HeartbeatReq
	if err := httpx.BindJSON(c, &req); err != nil {
		httpx.Fail(c, err)
		return
	}
	st, err := h.svc.Heartbeat(c.Request.Context(), *req.SessionOK, req.Message)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, st)
}

func (h *Handler) status(c *gin.Context) {
	st, err := h.svc.Status(c.Request.Context())
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, st)
}
