//go:build integration

package app_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"sidecup/api/internal/app"
	"sidecup/api/internal/platform/clock"
	"sidecup/api/internal/platform/config"
	"sidecup/api/internal/platform/db/testdb"
	"sidecup/api/internal/platform/realtime"
)

// md5("password")
const testPasswordHash = "5f4dcc3b5aa765d61d8327deb882cf99"

type harness struct {
	t     *testing.T
	DB    *gorm.DB
	Clock *clock.Fake
	Hub   *realtime.Hub
	App   *app.App
	Srv   *httptest.Server
	Loc   *time.Location
}

// newHarness dựng app trên DB thật; configure (nếu có) chỉnh cấu hình và phụ thuộc trước khi dựng.
func newHarness(t *testing.T, configure ...func(*app.Deps)) *harness {
	t.Helper()
	gdb := testdb.Open(t)
	loc, err := time.LoadLocation("Asia/Ho_Chi_Minh")
	require.NoError(t, err)
	clk := clock.NewFake(time.Now(), loc)
	hub := realtime.NewHub(clk.Now)
	deps := app.Deps{
		Config: config.Config{
			AppEnv: "test", AppTZ: loc.String(), Location: loc,
			PublicBaseURL: "http://sidecup.test", PublicHost: "sidecup.test",
			SellerPasswordHash: testPasswordHash, SessionSecret: strings.Repeat("s", 32), NotifierToken: "notifier-token-123456",
		},
		DB: gdb, Clock: clk, Hub: hub,
	}
	for _, fn := range configure {
		fn(&deps)
	}
	a, err := app.New(deps)
	require.NoError(t, err)
	a.Menu.Sync = true
	srv := httptest.NewServer(a.Engine)
	t.Cleanup(func() {
		hub.CloseAll()
		srv.Close()
	})
	return &harness{t: t, DB: gdb, Clock: clk, Hub: hub, App: a, Srv: srv, Loc: loc}
}

type resp struct {
	Code   int
	Body   []byte
	Header http.Header
}

func (r resp) JSON(t *testing.T, v any) {
	t.Helper()
	require.NoError(t, json.Unmarshal(r.Body, v), string(r.Body))
}

func (r resp) Map(t *testing.T) map[string]any {
	t.Helper()
	var m map[string]any
	r.JSON(t, &m)
	return m
}

func (r resp) ErrCode(t *testing.T) string {
	t.Helper()
	var e struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	r.JSON(t, &e)
	return e.Error.Code
}

// client gửi request tới server test; mỗi client có cookie jar và header riêng.
type client struct {
	h       *harness
	http    *http.Client
	headers map[string]string
}

func (h *harness) client(headers map[string]string) *client {
	jar, _ := cookiejar.New(nil)
	return &client{h: h, http: &http.Client{Jar: jar, Timeout: 10 * time.Second}, headers: headers}
}

// customer giả lập một thiết bị khách với client_id riêng.
func (h *harness) customer() (*client, string) {
	id := uuid.NewString()
	return h.client(map[string]string{"X-Client-Id": id}), id
}

func (h *harness) seller() *client {
	c := h.client(nil)
	r := c.do(http.MethodPost, "/api/seller/login", map[string]string{"password": "password"}, nil)
	require.Equal(h.t, http.StatusOK, r.Code, string(r.Body))
	return c
}

func (h *harness) notifier() *client {
	return h.client(map[string]string{"Authorization": "Bearer notifier-token-123456"})
}

func (c *client) do(method, path string, body any, extra map[string]string) resp {
	c.h.t.Helper()
	var rd io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		require.NoError(c.h.t, err)
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, c.h.Srv.URL+path, rd)
	require.NoError(c.h.t, err)
	req.Header.Set("Content-Type", "application/json")
	for k, v := range c.headers {
		req.Header.Set(k, v)
	}
	for k, v := range extra {
		req.Header.Set(k, v)
	}
	res, err := c.http.Do(req)
	require.NoError(c.h.t, err)
	defer func() { _ = res.Body.Close() }()
	b, err := io.ReadAll(res.Body)
	require.NoError(c.h.t, err)
	return resp{Code: res.StatusCode, Body: b, Header: res.Header}
}

func (c *client) get(path string) resp { return c.do(http.MethodGet, path, nil, nil) }
func (c *client) post(path string, body any) resp {
	return c.do(http.MethodPost, path, body, nil)
}

// ws mở WebSocket tới server test, mang theo cookie của client (cho /ws/seller).
func (c *client) ws(path string) *websocket.Conn {
	c.h.t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	hdr := http.Header{}
	u := c.h.Srv.URL + path
	req, _ := http.NewRequest(http.MethodGet, u, nil)
	for _, ck := range c.http.Jar.Cookies(req.URL) {
		hdr.Add("Cookie", ck.Name+"="+ck.Value)
	}
	conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(u, "http"), &websocket.DialOptions{HTTPHeader: hdr})
	require.NoError(c.h.t, err)
	c.h.t.Cleanup(func() { _ = conn.CloseNow() })
	return conn
}

type wsMsg struct {
	Type       string          `json:"type"`
	Data       json.RawMessage `json:"data"`
	ServerTime time.Time       `json:"server_time"`
}

// next đọc message kế tiếp có type mong muốn (bỏ qua ping), tối đa 5 giây.
func next(t *testing.T, conn *websocket.Conn, typ string) wsMsg {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	for {
		_, b, err := conn.Read(ctx)
		require.NoError(t, err, "chờ message %s", typ)
		var m wsMsg
		require.NoError(t, json.Unmarshal(b, &m))
		if m.Type == typ {
			return m
		}
	}
}

// waitSubscribed chờ hub ghi nhận kết nối (Dial trả về trước khi handler kịp Register).
func (h *harness) waitSubscribed(topic string, n int) {
	h.t.Helper()
	require.Eventually(h.t, func() bool { return h.Hub.Count(topic) >= n }, 2*time.Second, 10*time.Millisecond)
}

// fixture: một quán mở cả ngày, ba món, một bàn.
type fixture struct {
	PartnerID uuid.UUID
	Tea       uuid.UUID // 15.000đ, có ngọt/đá
	Water     uuid.UUID // 10.000đ, không tuỳ chọn
	Hidden    uuid.UUID // bị ẩn ở quán này
	Token     string
}

func (h *harness) fixture() fixture {
	f := fixture{PartnerID: testdb.SeedPartner(h.t, h.DB, testdb.PartnerOpts{})}
	f.Tea = testdb.SeedProduct(h.t, h.DB, testdb.ProductOpts{Name: "Trà đá", Price: 15000, Sort: 1})
	f.Water = testdb.SeedProduct(h.t, h.DB, testdb.ProductOpts{Name: "Nước suối", Price: 10000, NoSweet: true, NoIce: true, Sort: 2})
	f.Hidden = testdb.SeedProduct(h.t, h.DB, testdb.ProductOpts{Name: "Bia", Price: 20000, Sort: 3})
	testdb.HideProduct(h.t, h.DB, f.PartnerID, f.Hidden)
	f.Token = testdb.SeedQR(h.t, h.DB, f.PartnerID, "TABLE00001", "Bàn 1")
	return f
}

func orderBody(items ...map[string]any) map[string]any {
	return map[string]any{"items": items, "phone": "0901 234 567", "note": "  ít đá giúp em  "}
}

func line(id uuid.UUID, qty int) map[string]any { return map[string]any{"product_id": id, "qty": qty} }

// placeOrder tạo đơn với key mới và trả id.
func (c *client) placeOrder(token string, body map[string]any) (resp, string) {
	c.h.t.Helper()
	r := c.do(http.MethodPost, "/api/t/"+token+"/orders", body, map[string]string{"Idempotency-Key": uuid.NewString()})
	var out struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(r.Body, &out)
	return r, out.ID
}
