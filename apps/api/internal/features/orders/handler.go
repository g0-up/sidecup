package orders

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"sidecup/api/internal/platform/apperr"
	"sidecup/api/internal/platform/httpx"
)

type Handler struct {
	svc   *Service
	clock interface{ Now() time.Time }
}

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc, clock: svc.clock} }

// RegisterCustomer gắn vào nhóm /api đã có ClientID; createLimits là rate limit cho POST đơn.
func (h *Handler) RegisterCustomer(g *gin.RouterGroup, createLimits ...gin.HandlerFunc) {
	g.POST("/t/:token/orders", append(createLimits, h.create)...)
	g.GET("/orders/:id", h.getPublic)
	g.POST("/orders/:id/cancel", h.cancel)
}

func (h *Handler) RegisterSeller(g *gin.RouterGroup) {
	g.GET("/orders", h.list)
	g.GET("/orders/:id", h.getSeller)
	g.POST("/orders/:id/transition", h.transition)
}

func (h *Handler) create(c *gin.Context) {
	key, err := uuid.Parse(c.GetHeader("Idempotency-Key"))
	if err != nil {
		httpx.Fail(c, apperr.BadRequest("IDEMPOTENCY_KEY_REQUIRED", "Thiếu mã chống trùng đơn, vui lòng tải lại trang"))
		return
	}
	var req CreateReq
	if err := httpx.BindJSON(c, &req); err != nil {
		httpx.Fail(c, err)
		return
	}
	v, created, err := h.svc.Create(c.Request.Context(), c.Param("token"), c.GetString(httpx.ClientIDKey), key.String(), req)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	c.JSON(status, publicResp{PublicView: v, ServerTime: h.clock.Now()})
}

func (h *Handler) getPublic(c *gin.Context) {
	id, err := httpx.ParamUUID(c, "id", ErrOrderNotFound.Code, ErrOrderNotFound.Message)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	v, err := h.svc.GetPublic(c.Request.Context(), id)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	c.Header("Cache-Control", "no-store")
	httpx.OK(c, publicResp{PublicView: v, ServerTime: h.clock.Now()})
}

func (h *Handler) cancel(c *gin.Context) {
	id, err := httpx.ParamUUID(c, "id", ErrOrderNotFound.Code, ErrOrderNotFound.Message)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	v, err := h.svc.Cancel(c.Request.Context(), id, c.GetString(httpx.ClientIDKey))
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, publicResp{PublicView: v, ServerTime: h.clock.Now()})
}

func (h *Handler) list(c *gin.Context) {
	_, hasFrom := c.GetQuery("from")
	_, hasTo := c.GetQuery("to")
	if hasFrom || hasTo {
		h.history(c)
		return
	}
	scope := c.Query("scope")
	if scope != "" && scope != "open" && scope != "closed" {
		httpx.Fail(c, apperr.Field("scope", "Giá trị phải là open hoặc closed"))
		return
	}
	var after *time.Time
	if raw := c.Query("updated_after"); raw != "" {
		t, err := time.Parse(time.RFC3339Nano, raw)
		if err != nil {
			httpx.Fail(c, apperr.Field("updated_after", "Thời điểm phải theo RFC 3339"))
			return
		}
		after = &t
	}
	// Lấy server_time trước khi đọc: lần resync sau dùng mốc này, không bỏ sót thay đổi xen giữa.
	serverTime := h.clock.Now()
	out, err := h.svc.List(c.Request.Context(), scope, after)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	c.Header("Cache-Control", "no-store")
	httpx.OK(c, listResp{Orders: out, ServerTime: serverTime})
}

// history là chế độ "Tất cả đơn" của GET /orders: lọc theo ngày đặt, trạng thái, quán và phân trang con trỏ.
func (h *Handler) history(c *gin.Context) {
	_, hasScope := c.GetQuery("scope")
	_, hasAfter := c.GetQuery("updated_after")
	if hasScope || hasAfter {
		httpx.Fail(c, apperr.Field("scope", "Không dùng scope hoặc updated_after khi lọc theo ngày"))
		return
	}
	q := HistoryQuery{From: c.Query("from"), To: c.Query("to")}
	if raw := c.Query("status"); raw != "" {
		st := Status(raw)
		if !st.Valid() {
			httpx.Fail(c, apperr.Field("status", "Trạng thái không hợp lệ"))
			return
		}
		q.Status = &st
	}
	if raw := c.Query("partner_id"); raw != "" {
		id, err := uuid.Parse(raw)
		if err != nil {
			httpx.Fail(c, apperr.Field("partner_id", "Mã quán không hợp lệ"))
			return
		}
		q.PartnerID = &id
	}
	if raw := c.Query("cursor"); raw != "" {
		cur, err := decodeCursor(raw)
		if err != nil {
			httpx.Fail(c, err)
			return
		}
		q.Cursor = &cur
	}
	serverTime := h.clock.Now()
	out, next, err := h.svc.History(c.Request.Context(), q)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	c.Header("Cache-Control", "no-store")
	httpx.OK(c, historyResp{Orders: out, NextCursor: next, ServerTime: serverTime})
}

func (h *Handler) getSeller(c *gin.Context) {
	id, err := httpx.ParamUUID(c, "id", ErrOrderNotFound.Code, ErrOrderNotFound.Message)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	v, err := h.svc.GetSeller(c.Request.Context(), id)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, sellerResp{SellerView: v, ServerTime: h.clock.Now()})
}

func (h *Handler) transition(c *gin.Context) {
	id, err := httpx.ParamUUID(c, "id", ErrOrderNotFound.Code, ErrOrderNotFound.Message)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	var req TransitionReq
	if err := httpx.BindJSON(c, &req); err != nil {
		httpx.Fail(c, err)
		return
	}
	v, err := h.svc.Transition(c.Request.Context(), id, ActorSeller, req.ExpectedFrom, req.To,
		TransitionOpts{PaymentMethod: req.PaymentMethod, Reason: req.Reason})
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, sellerResp{SellerView: v, ServerTime: h.clock.Now()})
}
