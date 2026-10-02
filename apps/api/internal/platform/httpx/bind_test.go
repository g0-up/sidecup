package httpx

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"sidecup/api/internal/platform/apperr"
)

type sampleItem struct {
	Qty int `json:"qty" validate:"gte=1,lte=20"`
}

type sampleReq struct {
	Name  string       `json:"name" validate:"required,max=5"`
	ID    string       `json:"id" validate:"omitempty,uuid"`
	Kind  string       `json:"kind" validate:"omitempty,oneof=a b"`
	Items []sampleItem `json:"items" validate:"required,min=1,dive"`
}

func bind(t *testing.T, body string) error {
	t.Helper()
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
	var req sampleReq
	return BindJSON(c, &req)
}

func fieldsOf(t *testing.T, err error) map[string]string {
	t.Helper()
	e, ok := apperr.As(err)
	require.True(t, ok, "%v", err)
	require.Equal(t, http.StatusUnprocessableEntity, e.Status)
	return e.Details["fields"].(map[string]string)
}

func TestBindJSONValidMessagesInVietnamese(t *testing.T) {
	fields := fieldsOf(t, bind(t, `{"name":"","id":"x","kind":"z","items":[{"qty":0},{"qty":21}]}`))
	assert.Equal(t, "Không được để trống", fields["name"])
	assert.Equal(t, "Mã không hợp lệ", fields["id"])
	assert.Equal(t, "Giá trị phải là một trong: a, b", fields["kind"])
	assert.Equal(t, "Phải lớn hơn hoặc bằng 1", fields["items[0].qty"])
	assert.Equal(t, "Phải nhỏ hơn hoặc bằng 20", fields["items[1].qty"])

	fields = fieldsOf(t, bind(t, `{"name":"toolong","items":[]}`))
	assert.Equal(t, "Tối đa 5 ký tự", fields["name"])
	assert.Equal(t, "Cần ít nhất 1 mục", fields["items"])
}

func TestBindJSONRejectsMalformedAndUnknown(t *testing.T) {
	e, ok := apperr.As(bind(t, `{"name":`))
	require.True(t, ok)
	assert.Equal(t, http.StatusBadRequest, e.Status)

	e, ok = apperr.As(bind(t, `{"name":"a","items":[{"qty":1}],"extra":1}`))
	require.True(t, ok)
	assert.Equal(t, "INVALID_JSON", e.Code)

	fields := fieldsOf(t, bind(t, `{"name":"a","items":[{"qty":"x"}]}`))
	assert.Contains(t, fields, "items.qty")

	assert.NoError(t, bind(t, `{"name":"ab","items":[{"qty":2}]}`))
}

func TestBindJSONRejectsLargeBody(t *testing.T) {
	err := bind(t, `{"name":"`+strings.Repeat("a", maxBodyBytes)+`"}`)
	assert.ErrorIs(t, err, errBodyTooLarge)
}

func TestFailRendersEnvelope(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/", nil)
	Fail(c, apperr.Conflict("PAUSED", "Quán tạm ngưng nhận đơn").With("x", 1))
	assert.Equal(t, http.StatusConflict, w.Code)
	assert.JSONEq(t, `{"error":{"code":"PAUSED","message":"Quán tạm ngưng nhận đơn","details":{"x":1}}}`, w.Body.String())

	w = httptest.NewRecorder()
	c, _ = gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/", nil)
	Fail(c, assert.AnError)
	assert.Equal(t, http.StatusInternalServerError, w.Code)
	assert.Contains(t, w.Body.String(), `"code":"INTERNAL"`)
	assert.NotContains(t, w.Body.String(), assert.AnError.Error())
}
