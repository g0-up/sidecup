package partners

import (
	"github.com/gin-gonic/gin"

	"sidecup/api/internal/platform/httpx"
)

type Handler struct{ svc *Service }

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// Không có route xoá: quán ngừng hợp tác thì đặt active=false để báo cáo cũ còn nguyên.
func (h *Handler) RegisterSeller(g *gin.RouterGroup) {
	g.GET("/partners", h.list)
	g.POST("/partners", h.create)
	g.GET("/partners/:id", h.get)
	g.PUT("/partners/:id", h.update)
}

func (h *Handler) list(c *gin.Context) {
	out, err := h.svc.List(c.Request.Context())
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, gin.H{"partners": out})
}

func (h *Handler) get(c *gin.Context) {
	id, err := httpx.ParamUUID(c, "id", ErrNotFound.Code, ErrNotFound.Message)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	v, err := h.svc.Get(c.Request.Context(), id)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, v)
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
	id, err := httpx.ParamUUID(c, "id", ErrNotFound.Code, ErrNotFound.Message)
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
