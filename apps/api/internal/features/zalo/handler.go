package zalo

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"sidecup/api/internal/platform/httpx"
)

// Handler luôn được đăng ký; svc nil (thiếu ZALO_CREDENTIAL_KEY) thì GET báo configured=false để card
// vẫn hiển thị, các route khác trả 503.
type Handler struct{ svc *Service }

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func (h *Handler) RegisterSeller(g *gin.RouterGroup) {
	g.GET("/zalo", h.status)
	g.DELETE("/zalo", h.requireConfigured, h.unlink)
	g.POST("/zalo/link", h.requireConfigured, h.startLink)
	g.GET("/zalo/link/:id", h.requireConfigured, h.linkStatus)
	g.DELETE("/zalo/link/:id", h.requireConfigured, h.cancelLink)
}

func (h *Handler) requireConfigured(c *gin.Context) {
	if h.svc == nil {
		httpx.Fail(c, ErrNotConfigured)
	}
}

func (h *Handler) status(c *gin.Context) {
	if h.svc == nil {
		httpx.OK(c, StatusView{})
		return
	}
	st, err := h.svc.Status(c.Request.Context())
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, toStatusView(st))
}

func (h *Handler) startLink(c *gin.Context) {
	var req LinkReq
	if err := httpx.BindJSON(c, &req); err != nil {
		httpx.Fail(c, err)
		return
	}
	id, err := h.svc.StartLink(req.ConsentVersion)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	c.JSON(http.StatusAccepted, LinkStartView{LinkID: id.String()})
}

func (h *Handler) linkStatus(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		httpx.Fail(c, ErrLinkNotFound)
		return
	}
	snap, err := h.svc.LinkStatus(id)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, toLinkView(snap))
}

// cancelLink luôn 204 với id hợp lệ, kể cả attempt đã xong hay đã bị thay: huỷ hai lần không thành lỗi.
func (h *Handler) cancelLink(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		httpx.Fail(c, ErrLinkNotFound)
		return
	}
	h.svc.CancelLink(id)
	c.Status(http.StatusNoContent)
}

func (h *Handler) unlink(c *gin.Context) {
	if err := h.svc.Unlink(c.Request.Context()); err != nil {
		httpx.Fail(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
