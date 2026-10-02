package settings

import (
	"github.com/gin-gonic/gin"

	"sidecup/api/internal/platform/httpx"
)

type Handler struct{ svc *Service }

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func (h *Handler) RegisterSeller(g *gin.RouterGroup) {
	g.GET("/settings", h.get)
	g.PUT("/settings", h.update)
}

func (h *Handler) get(c *gin.Context) {
	st, err := h.svc.Get(c.Request.Context())
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, ToView(st))
}

func (h *Handler) update(c *gin.Context) {
	var req UpdateReq
	if err := httpx.BindJSON(c, &req); err != nil {
		httpx.Fail(c, err)
		return
	}
	view, err := h.svc.Update(c.Request.Context(), req)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, view)
}
