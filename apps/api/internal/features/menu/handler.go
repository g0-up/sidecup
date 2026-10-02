package menu

import (
	"github.com/gin-gonic/gin"

	"sidecup/api/internal/platform/httpx"
)

type Handler struct{ svc *Service }

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// RegisterCustomer gắn vào nhóm /api đã có middleware ClientID.
func (h *Handler) RegisterCustomer(g *gin.RouterGroup) {
	g.GET("/t/:token", h.get)
}

func (h *Handler) get(c *gin.Context) {
	v, err := h.svc.Get(c.Request.Context(), c.Param("token"), c.GetString(httpx.ClientIDKey))
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	c.Header("Cache-Control", "no-store")
	httpx.OK(c, v)
}
