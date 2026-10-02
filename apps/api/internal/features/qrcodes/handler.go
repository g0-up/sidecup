package qrcodes

import (
	"github.com/gin-gonic/gin"

	"sidecup/api/internal/platform/httpx"
)

type Handler struct{ svc *Service }

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func (h *Handler) RegisterSeller(g *gin.RouterGroup) {
	g.GET("/partners/:id/qrcodes", h.list)
	g.POST("/partners/:id/qrcodes", h.create)
	g.POST("/qrcodes/:token/revoke", h.revoke)
}

func (h *Handler) list(c *gin.Context) {
	id, err := httpx.ParamUUID(c, "id", errPartnerNotFound.Code, errPartnerNotFound.Message)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	out, err := h.svc.List(c.Request.Context(), id)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, gin.H{"qrcodes": out})
}

func (h *Handler) create(c *gin.Context) {
	id, err := httpx.ParamUUID(c, "id", errPartnerNotFound.Code, errPartnerNotFound.Message)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	var req CreateReq
	if err := httpx.BindJSON(c, &req); err != nil {
		httpx.Fail(c, err)
		return
	}
	v, err := h.svc.Create(c.Request.Context(), id, req)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.Created(c, v)
}

func (h *Handler) revoke(c *gin.Context) {
	v, err := h.svc.Revoke(c.Request.Context(), c.Param("token"))
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, v)
}
