package reports

import (
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"sidecup/api/internal/platform/apperr"
	"sidecup/api/internal/platform/httpx"
)

type Handler struct{ svc *Service }

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func (h *Handler) RegisterSeller(g *gin.RouterGroup) {
	g.GET("/reports/commission", h.commission)
	g.GET("/reports/commission/export", h.export)
	g.GET("/reports/funnel", h.funnel)
	g.GET("/adjustments", h.listAdjustments)
	g.POST("/adjustments", h.createAdjustment)
}

func parseQuery(c *gin.Context) (Query, error) {
	q := Query{Period: c.Query("period"), From: c.Query("from"), To: c.Query("to")}
	if raw := c.Query("partner_id"); raw != "" {
		id, err := uuid.Parse(raw)
		if err != nil {
			return q, apperr.Field("partner_id", "Mã quán không hợp lệ")
		}
		q.PartnerID = &id
	}
	return q, nil
}

func (h *Handler) commission(c *gin.Context) {
	q, err := parseQuery(c)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	if q.Period == "" && q.From == "" && q.To == "" {
		q.Period = PeriodCurrent
	}
	rep, err := h.svc.Commission(c.Request.Context(), q)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, rep)
}

var slugUnsafe = regexp.MustCompile(`[^a-z0-9]+`)

func (h *Handler) export(c *gin.Context) {
	q, err := parseQuery(c)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	if q.Period == "" && q.From == "" && q.To == "" {
		q.Period = PeriodCurrent
	}
	text, line, err := h.svc.Export(c.Request.Context(), q)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	slug := strings.Trim(slugUnsafe.ReplaceAllString(strings.ToLower(asciiFold(line.PartnerName)), "-"), "-")
	if slug == "" {
		slug = "quan"
	}
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="hoa-hong-%s-%s-%s.txt"`, slug, line.From, line.To))
	c.Header("Cache-Control", "no-store")
	c.Data(http.StatusOK, "text/plain; charset=utf-8", []byte(text))
}

func (h *Handler) funnel(c *gin.Context) {
	q, err := parseQuery(c)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	rep, err := h.svc.Funnel(c.Request.Context(), q)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, rep)
}

func (h *Handler) listAdjustments(c *gin.Context) {
	q, err := parseQuery(c)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	out, err := h.svc.ListAdjustments(c.Request.Context(), q)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.OK(c, gin.H{"adjustments": out})
}

func (h *Handler) createAdjustment(c *gin.Context) {
	var req CreateAdjustmentReq
	if err := httpx.BindJSON(c, &req); err != nil {
		httpx.Fail(c, err)
		return
	}
	v, err := h.svc.CreateAdjustment(c.Request.Context(), req)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.Created(c, v)
}

// asciiFold bỏ dấu tiếng Việt cho tên file tải về.
func asciiFold(s string) string {
	return foldReplacer.Replace(s)
}

var foldReplacer = func() *strings.Replacer {
	groups := map[string]string{
		"a": "àáạảãâầấậẩẫăằắặẳẵ", "e": "èéẹẻẽêềếệểễ", "i": "ìíịỉĩ", "o": "òóọỏõôồốộổỗơờớợởỡ",
		"u": "ùúụủũưừứựửữ", "y": "ỳýỵỷỹ", "d": "đ",
		"A": "ÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴ", "E": "ÈÉẸẺẼÊỀẾỆỂỄ", "I": "ÌÍỊỈĨ", "O": "ÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠ",
		"U": "ÙÚỤỦŨƯỪỨỰỬỮ", "Y": "ỲÝỴỶỸ", "D": "Đ",
	}
	var pairs []string
	for base, chars := range groups {
		for _, r := range chars {
			pairs = append(pairs, string(r), base)
		}
	}
	return strings.NewReplacer(pairs...)
}()
