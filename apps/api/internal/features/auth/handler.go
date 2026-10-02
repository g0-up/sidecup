package auth

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"sidecup/api/internal/platform/apperr"
	"sidecup/api/internal/platform/httpx"
)

type Handler struct {
	svc          *Service
	secureCookie bool
}

func NewHandler(svc *Service, secureCookie bool) *Handler {
	return &Handler{svc: svc, secureCookie: secureCookie}
}

type loginReq struct {
	Password string `json:"password" validate:"required,max=200"`
}

type meResp struct {
	Authenticated bool      `json:"authenticated"`
	ExpiresAt     time.Time `json:"expires_at"`
}

// RegisterPublic gắn route không cần phiên (login có rate limit riêng do router truyền vào).
func (h *Handler) RegisterPublic(g *gin.RouterGroup, loginLimit gin.HandlerFunc) {
	g.POST("/seller/login", loginLimit, h.login)
	g.POST("/seller/logout", h.logout)
}

func (h *Handler) RegisterSeller(g *gin.RouterGroup) {
	g.GET("/me", h.me)
}

func (h *Handler) login(c *gin.Context) {
	var req loginReq
	if err := httpx.BindJSON(c, &req); err != nil {
		httpx.Fail(c, err)
		return
	}
	token, sess, err := h.svc.Login(req.Password)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	h.setCookie(c, token, sess.ExpiresAt())
	httpx.OK(c, meResp{Authenticated: true, ExpiresAt: sess.ExpiresAt()})
}

func (h *Handler) logout(c *gin.Context) {
	h.setCookie(c, "", time.Unix(0, 0))
	c.Status(http.StatusNoContent)
}

func (h *Handler) me(c *gin.Context) {
	raw, _ := c.Cookie(CookieName)
	sess, err := h.svc.Verify(raw)
	if err != nil {
		httpx.Fail(c, apperr.New(http.StatusUnauthorized, "UNAUTHENTICATED", "Phiên đăng nhập đã hết, vui lòng đăng nhập lại"))
		return
	}
	httpx.OK(c, meResp{Authenticated: true, ExpiresAt: sess.ExpiresAt()})
}

func (h *Handler) setCookie(c *gin.Context, value string, expires time.Time) {
	ck := &http.Cookie{
		Name:     CookieName,
		Value:    value,
		Path:     "/",
		Expires:  expires,
		HttpOnly: true,
		Secure:   h.secureCookie,
		SameSite: http.SameSiteLaxMode,
	}
	if value == "" {
		ck.MaxAge = -1
	}
	http.SetCookie(c.Writer, ck)
}
