package products

import (
	"github.com/gin-gonic/gin"

	"sidecup/api/internal/platform/httpx"
)

type Handler struct{ svc *Service }

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func (h *Handler) RegisterSeller(g *gin.RouterGroup) {
	g.GET("/products", h.list)
	g.POST("/products", h.create)
	g.PUT("/products/:id", h.update)
	g.PATCH("/products/:id/availability", h.availability)
}

func (h *Handler) list(c *gin.Context) {
	out, err := h.svc.List(c.Request.Context())
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, gin.H{"products": out})
}

func (h *Handler) create(c *gin.Context) {
	var req UpsertReq
	if err := httpx.BindJSON(c, &req); err != nil {
		httpx.Fail(c, err)
		return
	}
	v, err := h.svc.Create(c.Request.Context(), req)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.Created(c, v)
}

func (h *Handler) update(c *gin.Context) {
	id, err := httpx.ParamUUID(c, "id", errNotFound.Code, errNotFound.Message)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	var req UpsertReq
	if err := httpx.BindJSON(c, &req); err != nil {
		httpx.Fail(c, err)
		return
	}
	v, err := h.svc.Update(c.Request.Context(), id, req)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, v)
}

func (h *Handler) availability(c *gin.Context) {
	id, err := httpx.ParamUUID(c, "id", errNotFound.Code, errNotFound.Message)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	var req AvailabilityReq
	if err := httpx.BindJSON(c, &req); err != nil {
		httpx.Fail(c, err)
		return
	}
	v, err := h.svc.SetAvailability(c.Request.Context(), id, *req.Available)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, v)
}
