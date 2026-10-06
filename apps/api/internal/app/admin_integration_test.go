//go:build integration

package app_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"regexp"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"sidecup/api/internal/app"
	"sidecup/api/internal/platform/realtime"
)

func TestHealthAndReady(t *testing.T) {
	h := newHarness(t)
	c := h.client(nil)
	assert.Equal(t, http.StatusOK, c.get("/healthz").Code)
	assert.Equal(t, http.StatusOK, c.get("/readyz").Code)
	r := c.get("/api/nope")
	assert.Equal(t, http.StatusNotFound, r.Code)
	assert.Equal(t, "NOT_FOUND", r.ErrCode(t))
}

func TestSellerAuthFlow(t *testing.T) {
	h := newHarness(t)
	anon := h.client(nil)
	r := anon.get("/api/seller/me")
	assert.Equal(t, http.StatusUnauthorized, r.Code)
	assert.Equal(t, "UNAUTHENTICATED", r.ErrCode(t))

	r = anon.post("/api/seller/login", map[string]string{"password": "nope"})
	assert.Equal(t, http.StatusUnauthorized, r.Code)

	s := h.seller()
	r = s.get("/api/seller/me")
	require.Equal(t, http.StatusOK, r.Code)
	assert.Equal(t, true, r.Map(t)["authenticated"])

	assert.Equal(t, http.StatusNoContent, s.post("/api/seller/logout", nil).Code)
	assert.Equal(t, http.StatusUnauthorized, s.get("/api/seller/me").Code)
}

func TestProductsAndPartnersCRUD(t *testing.T) {
	h := newHarness(t)
	s := h.seller()

	r := s.post("/api/seller/products", map[string]any{"name": "Trà đá", "price": 15000, "has_sweet": true, "has_ice": true, "sort": 1})
	require.Equal(t, http.StatusCreated, r.Code, string(r.Body))
	var tea struct {
		ID        string `json:"id"`
		Available bool   `json:"available"`
	}
	r.JSON(t, &tea)
	assert.True(t, tea.Available)

	r = s.post("/api/seller/products", map[string]any{"name": " ", "price": -1})
	assert.Equal(t, http.StatusUnprocessableEntity, r.Code)

	r = s.do(http.MethodPatch, "/api/seller/products/"+tea.ID+"/availability", map[string]bool{"available": false}, nil)
	require.Equal(t, http.StatusOK, r.Code)
	assert.Equal(t, false, r.Map(t)["available"])

	body := map[string]any{
		"name": "Quán Cơm Ngon", "commission_rate": 0.15, "payout_period": "week",
		"open_hours":         []map[string]any{{"days": []int{1, 2, 3, 4, 5}, "from": "11:00", "to": "13:30"}},
		"hidden_product_ids": []string{tea.ID},
	}
	r = s.post("/api/seller/partners", body)
	require.Equal(t, http.StatusCreated, r.Code, string(r.Body))
	var p struct {
		ID               string   `json:"id"`
		CommissionRate   float64  `json:"commission_rate"`
		Active           bool     `json:"active"`
		HiddenProductIDs []string `json:"hidden_product_ids"`
	}
	r.JSON(t, &p)
	assert.Equal(t, 0.15, p.CommissionRate)
	assert.True(t, p.Active)

	r = s.get("/api/seller/partners/" + p.ID)
	require.Equal(t, http.StatusOK, r.Code)
	r.JSON(t, &p)
	assert.Equal(t, []string{tea.ID}, p.HiddenProductIDs)

	body["hidden_product_ids"] = []string{}
	body["active"] = false
	r = s.do(http.MethodPut, "/api/seller/partners/"+p.ID, body, nil)
	require.Equal(t, http.StatusOK, r.Code, string(r.Body))
	r.JSON(t, &p)
	assert.Empty(t, p.HiddenProductIDs)
	assert.False(t, p.Active)

	body["open_hours"] = []map[string]any{{"days": []int{}, "from": "11:00", "to": "13:30"}}
	r = s.do(http.MethodPut, "/api/seller/partners/"+p.ID, body, nil)
	assert.Equal(t, http.StatusUnprocessableEntity, r.Code)
	assert.Contains(t, string(r.Body), "open_hours")

	body["open_hours"] = []map[string]any{{"days": []int{1}, "from": "11:00", "to": "13:30"}}
	body["hidden_product_ids"] = []string{"00000000-0000-4000-8000-00000000dead"}
	r = s.do(http.MethodPut, "/api/seller/partners/"+p.ID, body, nil)
	assert.Equal(t, http.StatusUnprocessableEntity, r.Code)

	r = s.get("/api/seller/partners/00000000-0000-4000-8000-00000000dead")
	assert.Equal(t, http.StatusNotFound, r.Code)
}

func TestQRCodesCreateAndRevoke(t *testing.T) {
	h := newHarness(t)
	s := h.seller()
	f := h.fixture()

	r := s.post("/api/seller/partners/"+f.PartnerID.String()+"/qrcodes", map[string]string{"table_label": "Bàn 7"})
	require.Equal(t, http.StatusCreated, r.Code, string(r.Body))
	var qr struct {
		Token string `json:"token"`
		URL   string `json:"url"`
	}
	r.JSON(t, &qr)
	assert.Regexp(t, regexp.MustCompile(`^http://sidecup\.test/t/[A-HJ-NP-Z2-9]{12}$`), qr.URL)

	r = s.get("/api/seller/partners/" + f.PartnerID.String() + "/qrcodes")
	require.Equal(t, http.StatusOK, r.Code)
	var list struct {
		QRCodes []map[string]any `json:"qrcodes"`
	}
	r.JSON(t, &list)
	assert.Len(t, list.QRCodes, 2)

	first := s.post("/api/seller/qrcodes/"+qr.Token+"/revoke", nil)
	require.Equal(t, http.StatusOK, first.Code)
	second := s.post("/api/seller/qrcodes/"+qr.Token+"/revoke", nil)
	require.Equal(t, http.StatusOK, second.Code, "thu hồi hai lần vẫn 200")
	assert.Equal(t, first.Map(t)["revoked_at"], second.Map(t)["revoked_at"])
	assert.Equal(t, http.StatusNotFound, s.post("/api/seller/qrcodes/NOPE/revoke", nil).Code)

	cust, _ := h.customer()
	r = cust.get("/api/t/" + qr.Token)
	assert.Equal(t, http.StatusGone, r.Code)
	assert.Equal(t, "QR_REVOKED", r.ErrCode(t))
}

func TestSettingsUpdatePublishesToSellerAndMenu(t *testing.T) {
	h := newHarness(t)
	s := h.seller()
	f := h.fixture()
	sellerWS := s.ws("/ws/seller")
	_, cid := h.customer()
	menuWS := h.client(nil).ws("/ws/customer?client_id=" + cid + "&token=" + f.Token)
	h.waitSubscribed(realtime.TopicSeller, 1)
	h.waitSubscribed(realtime.TopicMenu(f.Token), 1)

	r := s.do(http.MethodPut, "/api/seller/settings", map[string]any{"accepting_orders": false, "eta_minutes": 10}, nil)
	require.Equal(t, http.StatusOK, r.Code, string(r.Body))

	m := next(t, sellerWS, realtime.TypeSettingsUpdated)
	var st map[string]any
	require.NoError(t, json.Unmarshal(m.Data, &st))
	assert.Equal(t, false, st["accepting_orders"])
	assert.Equal(t, float64(10), st["eta_minutes"])

	m = next(t, menuWS, realtime.TypeMenuUpdated)
	var mu struct {
		Ordering struct {
			Enabled bool    `json:"enabled"`
			Reason  *string `json:"reason"`
		} `json:"ordering"`
		Products []map[string]any `json:"products"`
	}
	require.NoError(t, json.Unmarshal(m.Data, &mu))
	assert.False(t, mu.Ordering.Enabled)
	assert.Equal(t, "paused", *mu.Ordering.Reason)
	assert.Len(t, mu.Products, 2, "món ẩn không có trong menu.updated")

	r = s.do(http.MethodPut, "/api/seller/settings", map[string]any{"bank_bin": "12345", "bank_account": "abc"}, nil)
	assert.Equal(t, http.StatusUnprocessableEntity, r.Code)

	// Thu hồi mã đang mở → trang menu nhận revoked.
	require.Equal(t, http.StatusOK, s.post("/api/seller/qrcodes/"+f.Token+"/revoke", nil).Code)
	m = next(t, menuWS, realtime.TypeMenuUpdated)
	assert.JSONEq(t, `{"revoked":true}`, string(m.Data))
}

func TestCustomerWebSocketAuthorization(t *testing.T) {
	h := newHarness(t)
	f := h.fixture()
	cust, cid := h.customer()
	_, id := cust.placeOrder(f.Token, orderBody(line(f.Tea, 1)))
	require.NotEmpty(t, id)

	ok := h.client(nil).ws("/ws/customer?client_id=" + cid + "&order=" + id + "&token=" + f.Token)
	h.waitSubscribed(realtime.TopicOrder(id), 1)
	_ = ok

	_, otherCID := h.customer()
	for _, q := range []string{
		"?client_id=" + otherCID + "&order=" + id, // đơn của máy khác
		"?client_id=" + cid + "&token=NOPE",       // token không tồn tại
		"?client_id=not-a-uuid&token=" + f.Token,  // client_id sai
		"?client_id=" + cid,                       // không yêu cầu topic nào
	} {
		conn := h.client(nil).ws("/ws/customer" + q)
		_, _, err := conn.Read(t.Context())
		assert.Equal(t, realtime.CloseForbidden, websocketStatus(err), q)
	}
}

type recordedPut struct{ key, contentType string }

// memStore thay R2: ghi lại key và Content-Type để kiểm tra mà không gọi mạng.
type memStore struct {
	mu   sync.Mutex
	puts []recordedPut
}

func (m *memStore) Put(_ context.Context, key, contentType string, _ []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.puts = append(m.puts, recordedPut{key, contentType})
	return nil
}

func withImageStore(store *memStore) func(*app.Deps) {
	return func(d *app.Deps) {
		d.Images = store
		d.Config.R2PublicBaseURL = "https://img.sidecup.test"
		d.Config.R2Folder = "sidecup/products"
	}
}

// upload gửi multipart với một file dưới tên field cho trước.
func (c *client) upload(field string, data []byte) resp {
	c.h.t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	fw, err := mw.CreateFormFile(field, "photo.webp")
	require.NoError(c.h.t, err)
	_, err = fw.Write(data)
	require.NoError(c.h.t, err)
	require.NoError(c.h.t, mw.Close())
	req, err := http.NewRequest(http.MethodPost, c.h.Srv.URL+"/api/seller/products/images", &buf)
	require.NoError(c.h.t, err)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	res, err := c.http.Do(req)
	require.NoError(c.h.t, err)
	defer func() { _ = res.Body.Close() }()
	b, err := io.ReadAll(res.Body)
	require.NoError(c.h.t, err)
	return resp{Code: res.StatusCode, Body: b, Header: res.Header}
}

var webpImage = append([]byte("RIFF\x00\x00\x00\x00WEBPVP8 "), make([]byte, 64)...)

func TestProductImageUpload(t *testing.T) {
	store := &memStore{}
	h := newHarness(t, withImageStore(store))

	assert.Equal(t, http.StatusUnauthorized, h.client(nil).upload("file", webpImage).Code)

	s := h.seller()
	r := s.upload("file", webpImage)
	require.Equal(t, http.StatusCreated, r.Code, string(r.Body))
	var out struct {
		URL string `json:"url"`
	}
	r.JSON(t, &out)
	require.Len(t, store.puts, 1)
	assert.Regexp(t, `^sidecup/products/[0-9a-f-]{36}\.webp$`, store.puts[0].key)
	assert.Equal(t, "image/webp", store.puts[0].contentType)
	assert.Equal(t, "https://img.sidecup.test/"+store.puts[0].key, out.URL)

	r = s.post("/api/seller/products", map[string]any{"name": "Trà đào", "price": 25000, "image_url": out.URL})
	require.Equal(t, http.StatusCreated, r.Code, string(r.Body))
	assert.Equal(t, out.URL, r.Map(t)["image_url"])

	r = s.upload("file", bytes.Repeat([]byte{0xFF}, 5<<20+1))
	assert.Equal(t, http.StatusRequestEntityTooLarge, r.Code)
	assert.Equal(t, "FILE_TOO_LARGE", r.ErrCode(t))

	for name, tc := range map[string]struct {
		field string
		data  []byte
	}{
		"missing file": {"photo", webpImage},
		"not an image": {"file", []byte("<svg xmlns='http://www.w3.org/2000/svg'/>")},
	} {
		r = s.upload(tc.field, tc.data)
		assert.Equal(t, http.StatusUnprocessableEntity, r.Code, name)
		assert.Contains(t, r.Map(t)["error"].(map[string]any)["details"].(map[string]any)["fields"], "file", name)
	}
	assert.Len(t, store.puts, 1, "chỉ ảnh hợp lệ mới được ghi")
}

func TestProductImageUploadDisabled(t *testing.T) {
	h := newHarness(t)
	r := h.seller().upload("file", webpImage)
	assert.Equal(t, http.StatusServiceUnavailable, r.Code)
	assert.Equal(t, "UPLOAD_DISABLED", r.ErrCode(t))
}
