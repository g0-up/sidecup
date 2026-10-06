package products

import (
	"errors"
	"log/slog"

	"github.com/gin-gonic/gin"

	"sidecup/api/internal/platform/httpx"
)

// Handler: images nil (chưa cấu hình R2) thì route tải ảnh vẫn đăng ký nhưng trả 503.
type Handler struct {
	svc    *Service
	images *ImageService
}

func NewHandler(svc *Service, images *ImageService) *Handler {
	return &Handler{svc: svc, images: images}
}

func (h *Handler) RegisterSeller(g *gin.RouterGroup) {
	g.GET("/products", h.list)
	g.POST("/products", h.create)
	g.POST("/products/images", h.uploadImage)
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

func (h *Handler) uploadImage(c *gin.Context) {
	if h.images == nil {
		httpx.Fail(c, ErrUploadDisabled)
		return
	}
	data, err := readImage(c)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	url, err := h.images.Upload(c.Request.Context(), data)
	if err != nil {
		if errors.Is(err, errUploadFailed) {
			// Không ghi khoá R2: chỉ key và lỗi của kho.
			slog.ErrorContext(c.Request.Context(), "upload product image", "err", err, "request_id", c.GetString(httpx.RequestIDKey))
		}
		httpx.Fail(c, err)
		return
	}
	httpx.Created(c, gin.H{"url": url})
}
