//go:build integration

package app_test

import (
	"encoding/json"
	"net/http"
	"net/url"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"sidecup/api/internal/platform/db/testdb"
	"sidecup/api/internal/platform/realtime"
)

func websocketStatus(err error) websocket.StatusCode { return websocket.CloseStatus(err) }

type orderView struct {
	ID            string  `json:"id"`
	Code          string  `json:"code"`
	Status        string  `json:"status"`
	Total         int64   `json:"total"`
	Note          *string `json:"note"`
	CancelReason  *string `json:"cancel_reason"`
	CustomerPhone *string `json:"customer_phone"`
	Items         []struct {
		ProductID string  `json:"product_id"`
		Name      string  `json:"name"`
		Qty       int     `json:"qty"`
		Sweet     *string `json:"sweet"`
		Ice       *string `json:"ice"`
		LineTotal int64   `json:"line_total"`
	} `json:"items"`
	CommissionAmount *int64    `json:"commission_amount"`
	PaymentMethod    *string   `json:"payment_method"`
	ServerTime       time.Time `json:"server_time"`
}

func TestMenuFiltersHiddenAndRecordsPageViews(t *testing.T) {
	h := newHarness(t)
	f := h.fixture()
	testdb.SeedProduct(t, h.DB, testdb.ProductOpts{Name: "Sinh tố", Price: 30000, Unavailable: true, Sort: 4})
	cust, cid := h.customer()

	r := cust.get("/api/t/" + f.Token)
	require.Equal(t, http.StatusOK, r.Code, string(r.Body))
	var m struct {
		Partner    struct{ Name string } `json:"partner"`
		TableLabel string                `json:"table_label"`
		EtaMinutes int                   `json:"eta_minutes"`
		Ordering   struct {
			Enabled bool `json:"enabled"`
		} `json:"ordering"`
		Products []struct {
			ID        string `json:"id"`
			Name      string `json:"name"`
			Available bool   `json:"available"`
		} `json:"products"`
		MyOrders []map[string]any `json:"my_orders"`
	}
	r.JSON(t, &m)
	assert.Equal(t, "Quán test", m.Partner.Name)
	assert.Equal(t, "Bàn 1", m.TableLabel)
	assert.Equal(t, 7, m.EtaMinutes)
	assert.True(t, m.Ordering.Enabled)
	names := map[string]bool{}
	for _, p := range m.Products {
		names[p.Name] = p.Available
		assert.NotEqual(t, f.Hidden.String(), p.ID, "món ẩn không được hiện")
	}
	assert.Equal(t, map[string]bool{"Trà đá": true, "Nước suối": true, "Sinh tố": false}, names)
	assert.Empty(t, m.MyOrders)

	cust.get("/api/t/" + f.Token)
	other, _ := h.customer()
	other.get("/api/t/" + f.Token)
	var views int64
	require.NoError(t, h.DB.Table("page_views").Count(&views).Error)
	assert.Equal(t, int64(2), views, "một thiết bị chỉ tính một lần mỗi ngày")

	_, id := cust.placeOrder(f.Token, orderBody(line(f.Tea, 1)))
	r = cust.get("/api/t/" + f.Token)
	r.JSON(t, &m)
	require.Len(t, m.MyOrders, 1, "quét lại thấy đơn đang chạy")
	assert.Equal(t, id, m.MyOrders[0]["id"])
	_ = cid

	assert.Equal(t, http.StatusNotFound, cust.get("/api/t/NOPE0000").Code)
	assert.Equal(t, http.StatusBadRequest, h.client(nil).get("/api/t/"+f.Token).Code, "thiếu X-Client-Id")
}

func TestCreateOrderPricesMergesAndIsIdempotent(t *testing.T) {
	h := newHarness(t)
	f := h.fixture()
	cust, _ := h.customer()
	key := uuid.NewString()
	body := orderBody(line(f.Tea, 2), map[string]any{"product_id": f.Tea, "qty": 1, "sweet": "medium", "ice": "normal"}, line(f.Water, 1))

	r := cust.do(http.MethodPost, "/api/t/"+f.Token+"/orders", body, map[string]string{"Idempotency-Key": key})
	require.Equal(t, http.StatusCreated, r.Code, string(r.Body))
	var o orderView
	r.JSON(t, &o)
	assert.Equal(t, "sent", o.Status)
	assert.Equal(t, int64(55000), o.Total)
	require.Len(t, o.Items, 2)
	assert.Equal(t, 3, o.Items[0].Qty, "hai dòng cùng tuỳ chọn được gộp")
	assert.Equal(t, "ít đá giúp em", *o.Note)
	assert.Nil(t, o.CustomerPhone, "view công khai không có SĐT")
	assert.False(t, o.ServerTime.IsZero())

	r2 := cust.do(http.MethodPost, "/api/t/"+f.Token+"/orders", orderBody(line(f.Water, 5)), map[string]string{"Idempotency-Key": key})
	require.Equal(t, http.StatusOK, r2.Code)
	var again orderView
	r2.JSON(t, &again)
	assert.Equal(t, o.ID, again.ID, "cùng key trả lại đơn cũ bất kể body")

	thief, _ := h.customer()
	r3 := thief.do(http.MethodPost, "/api/t/"+f.Token+"/orders", body, map[string]string{"Idempotency-Key": key})
	assert.Equal(t, http.StatusConflict, r3.Code)
	assert.Equal(t, "IDEMPOTENCY_MISMATCH", r3.ErrCode(t))

	var stored struct{ CustomerPhone string }
	require.NoError(t, h.DB.Raw("SELECT customer_phone FROM orders WHERE id = ?", o.ID).Scan(&stored).Error)
	assert.Equal(t, "0901234567", stored.CustomerPhone)

	var events, outbox int64
	h.DB.Table("order_events").Where("order_id = ?", o.ID).Count(&events)
	h.DB.Table("notification_outbox").Where("order_id = ? AND kind = 'seller_new_order' AND recipient = 'seller'", o.ID).Count(&outbox)
	assert.Equal(t, int64(1), events)
	assert.Equal(t, int64(1), outbox)
}

func TestCreateOrderConcurrentSameKeyMakesOneOrder(t *testing.T) {
	h := newHarness(t)
	f := h.fixture()
	cust, _ := h.customer()
	key := uuid.NewString()

	var wg sync.WaitGroup
	codes := make([]int, 10)
	ids := make([]string, 10)
	for i := range 10 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			r := cust.do(http.MethodPost, "/api/t/"+f.Token+"/orders", orderBody(line(f.Tea, 1)), map[string]string{"Idempotency-Key": key})
			codes[i] = r.Code
			var o orderView
			_ = json.Unmarshal(r.Body, &o)
			ids[i] = o.ID
		}()
	}
	wg.Wait()

	created, replayed := 0, 0
	for i, c := range codes {
		switch c {
		case http.StatusCreated:
			created++
		case http.StatusOK:
			replayed++
		default:
			t.Errorf("request %d trả %d", i, c)
		}
		assert.Equal(t, ids[0], ids[i])
	}
	assert.Equal(t, 1, created)
	assert.Equal(t, 9, replayed)
	var n int64
	h.DB.Table("orders").Count(&n)
	assert.Equal(t, int64(1), n)
}

func TestCreateOrderRejections(t *testing.T) {
	h := newHarness(t)
	f := h.fixture()
	cust, _ := h.customer()
	s := h.seller()

	r, _ := cust.placeOrder(f.Token, map[string]any{"items": []any{line(f.Tea, 1)}, "phone": "12345"})
	assert.Equal(t, http.StatusUnprocessableEntity, r.Code)
	assert.Contains(t, string(r.Body), `"phone"`)

	r, _ = cust.placeOrder(f.Token, orderBody(line(f.Tea, 21)))
	assert.Equal(t, http.StatusUnprocessableEntity, r.Code)

	r, _ = cust.placeOrder(f.Token, orderBody(map[string]any{"product_id": f.Water, "qty": 1, "ice": "none"}))
	assert.Equal(t, http.StatusUnprocessableEntity, r.Code, "món không có tuỳ chọn đá")

	r, _ = cust.placeOrder(f.Token, orderBody(line(f.Hidden, 1), line(f.Tea, 1)))
	assert.Equal(t, http.StatusConflict, r.Code)
	assert.Equal(t, "PRODUCT_UNAVAILABLE", r.ErrCode(t))
	assert.Contains(t, string(r.Body), f.Hidden.String())

	require.Equal(t, http.StatusOK, s.do(http.MethodPatch, "/api/seller/products/"+f.Tea.String()+"/availability", map[string]bool{"available": false}, nil).Code)
	r, _ = cust.placeOrder(f.Token, orderBody(line(f.Tea, 1)))
	assert.Equal(t, "PRODUCT_UNAVAILABLE", r.ErrCode(t))
	s.do(http.MethodPatch, "/api/seller/products/"+f.Tea.String()+"/availability", map[string]bool{"available": true}, nil)

	require.Equal(t, http.StatusOK, s.do(http.MethodPut, "/api/seller/settings", map[string]bool{"accepting_orders": false}, nil).Code)
	r, _ = cust.placeOrder(f.Token, orderBody(line(f.Tea, 1)))
	assert.Equal(t, "PAUSED", r.ErrCode(t))
	s.do(http.MethodPut, "/api/seller/settings", map[string]bool{"accepting_orders": true}, nil)

	// Quán chỉ mở Thứ Hai: đặt đồng hồ sang Chủ Nhật.
	closed := testdb.SeedPartner(t, h.DB, testdb.PartnerOpts{Name: "Quán Thứ Hai", OpenHours: `[{"days":[1],"from":"11:00","to":"13:30"}]`})
	tok := testdb.SeedQR(t, h.DB, closed, "TABLE00002", "Bàn 2")
	h.Clock.Set(time.Date(2026, 10, 4, 12, 0, 0, 0, h.Loc))
	r, _ = cust.placeOrder(tok, orderBody(line(f.Tea, 1)))
	assert.Equal(t, "OUTSIDE_HOURS", r.ErrCode(t))
	menu := cust.get("/api/t/" + tok).Map(t)
	assert.Equal(t, "closed", menu["ordering"].(map[string]any)["reason"])

	s.post("/api/seller/qrcodes/"+f.Token+"/revoke", nil)
	r, _ = cust.placeOrder(f.Token, orderBody(line(f.Tea, 1)))
	assert.Equal(t, http.StatusConflict, r.Code)
	assert.Equal(t, "QR_REVOKED", r.ErrCode(t))

	r = cust.do(http.MethodPost, "/api/t/"+tok+"/orders", orderBody(line(f.Tea, 1)), nil)
	assert.Equal(t, "IDEMPOTENCY_KEY_REQUIRED", r.ErrCode(t))
}

func TestCustomerGetAndCancel(t *testing.T) {
	h := newHarness(t)
	f := h.fixture()
	cust, _ := h.customer()
	_, id := cust.placeOrder(f.Token, orderBody(line(f.Tea, 1)))

	r := h.client(map[string]string{"X-Client-Id": uuid.NewString()}).get("/api/orders/" + id)
	require.Equal(t, http.StatusOK, r.Code)
	assert.NotContains(t, string(r.Body), "0901234567")
	assert.NotContains(t, string(r.Body), "client_id")
	assert.NotContains(t, string(r.Body), "qr_token")
	pub := r.Map(t)
	assert.Equal(t, "/t/"+f.Token, pub["menu_path"])
	assert.EqualValues(t, 7, pub["eta_minutes"])
	assert.Equal(t, false, pub["notify_zalo"], "Zalo chưa bật thì không hứa gửi tin")

	other, _ := h.customer()
	r = other.post("/api/orders/"+id+"/cancel", nil)
	assert.Equal(t, http.StatusForbidden, r.Code)
	assert.Equal(t, "NOT_OWNER", r.ErrCode(t))

	r = cust.post("/api/orders/"+id+"/cancel", nil)
	require.Equal(t, http.StatusOK, r.Code, string(r.Body))
	var o orderView
	r.JSON(t, &o)
	assert.Equal(t, "cancelled", o.Status)
	assert.Equal(t, "customer", *o.CancelReason)

	r = cust.post("/api/orders/"+id+"/cancel", nil)
	assert.Equal(t, http.StatusConflict, r.Code)
	assert.Equal(t, "INVALID_TRANSITION", r.ErrCode(t))

	var outbox int64
	h.DB.Table("notification_outbox").Where("order_id = ? AND kind = 'customer_status'", id).Count(&outbox)
	assert.Zero(t, outbox, "khách tự huỷ thì không gửi tin")

	assert.Equal(t, http.StatusNotFound, cust.get("/api/orders/"+uuid.NewString()).Code)
	assert.Equal(t, http.StatusNotFound, cust.get("/api/orders/not-a-uuid").Code)
}

func transition(s *client, id, from, to string, extra map[string]any) resp {
	body := map[string]any{"to": to, "expected_from": from}
	for k, v := range extra {
		body[k] = v
	}
	return s.post("/api/seller/orders/"+id+"/transition", body)
}

func TestSellerFlowToPaidStoresCommissionAndIsImmutable(t *testing.T) {
	h := newHarness(t)
	f := h.fixture()
	cust, _ := h.customer()
	s := h.seller()
	_, id := cust.placeOrder(f.Token, orderBody(line(f.Tea, 3)))

	r := s.get("/api/seller/orders?scope=open")
	require.Equal(t, http.StatusOK, r.Code)
	var list struct {
		Orders     []orderView `json:"orders"`
		ServerTime time.Time   `json:"server_time"`
	}
	r.JSON(t, &list)
	require.Len(t, list.Orders, 1)
	assert.Equal(t, "0901234567", *list.Orders[0].CustomerPhone, "người bán thấy SĐT")

	require.Equal(t, http.StatusOK, transition(s, id, "sent", "accepted", nil).Code)
	require.Equal(t, http.StatusOK, transition(s, id, "accepted", "delivering", nil).Code)
	r = transition(s, id, "delivering", "paid", nil)
	assert.Equal(t, http.StatusUnprocessableEntity, r.Code, "thiếu payment_method")
	r = transition(s, id, "delivering", "paid", map[string]any{"payment_method": "cash"})
	require.Equal(t, http.StatusOK, r.Code, string(r.Body))
	var paid orderView
	r.JSON(t, &paid)
	assert.Equal(t, "paid", paid.Status)
	assert.Equal(t, int64(45000), paid.Total)
	assert.Equal(t, int64(6750), *paid.CommissionAmount)
	assert.Equal(t, "cash", *paid.PaymentMethod)

	for _, to := range []string{"accepted", "rejected", "delivering", "paid", "failed"} {
		for _, from := range []string{"sent", "accepted", "delivering"} {
			r := transition(s, id, from, to, map[string]any{"payment_method": "cash"})
			if to != "paid" {
				r = transition(s, id, from, to, nil)
			}
			assert.Equal(t, http.StatusConflict, r.Code, "%s→%s", from, to)
			assert.Equal(t, "paid", r.Map(t)["error"].(map[string]any)["details"].(map[string]any)["current_status"])
		}
	}
	var after orderView
	s.get("/api/seller/orders/"+id).JSON(t, &after)
	assert.Equal(t, "paid", after.Status)
	assert.Equal(t, int64(6750), *after.CommissionAmount)

	var kinds []string
	h.DB.Table("notification_outbox").Where("order_id = ? AND kind = 'customer_status'", id).Order("id").
		Pluck("payload->>'status'", &kinds)
	assert.Equal(t, []string{"accepted", "delivering", "paid"}, kinds)

	r = s.get("/api/seller/orders?updated_after=" + url.QueryEscape(list.ServerTime.Format(time.RFC3339Nano)))
	require.Equal(t, http.StatusOK, r.Code, string(r.Body))
	list.Orders = nil
	r.JSON(t, &list)
	require.Len(t, list.Orders, 1, "resync trả cả đơn đã đóng để màn người bán gỡ khỏi bảng")
	r = s.get("/api/seller/orders?scope=closed")
	require.Equal(t, http.StatusOK, r.Code)
	list.Orders = nil
	r.JSON(t, &list)
	assert.Len(t, list.Orders, 1)
}

func TestConcurrentSellerTransitionsOneWins(t *testing.T) {
	h := newHarness(t)
	f := h.fixture()
	cust, _ := h.customer()
	s1 := h.seller()
	s2 := h.seller()
	_, id := cust.placeOrder(f.Token, orderBody(line(f.Tea, 1)))

	var wg sync.WaitGroup
	results := make([]resp, 2)
	for i, s := range []*client{s1, s2} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			results[i] = transition(s, id, "sent", "accepted", nil)
		}()
	}
	wg.Wait()
	codes := []int{results[0].Code, results[1].Code}
	assert.ElementsMatch(t, []int{http.StatusOK, http.StatusConflict}, codes)
	for _, r := range results {
		if r.Code == http.StatusConflict {
			assert.Equal(t, "accepted", r.Map(t)["error"].(map[string]any)["details"].(map[string]any)["current_status"])
		}
	}
	var events int64
	h.DB.Table("order_events").Where("order_id = ? AND to_status = 'accepted'", id).Count(&events)
	assert.Equal(t, int64(1), events)
}

func TestRejectAndFailed(t *testing.T) {
	h := newHarness(t)
	f := h.fixture()
	cust, _ := h.customer()
	s := h.seller()

	_, a := cust.placeOrder(f.Token, orderBody(line(f.Tea, 1)))
	r := transition(s, a, "sent", "rejected", nil)
	require.Equal(t, http.StatusOK, r.Code)
	var o orderView
	r.JSON(t, &o)
	assert.Equal(t, "seller_rejected", *o.CancelReason)

	_, b := cust.placeOrder(f.Token, orderBody(line(f.Water, 1)))
	transition(s, b, "sent", "accepted", nil)
	transition(s, b, "accepted", "delivering", nil)
	r = transition(s, b, "delivering", "failed", nil)
	require.Equal(t, http.StatusOK, r.Code)
	r.JSON(t, &o)
	assert.Equal(t, "customer_not_found", *o.CancelReason)

	r = transition(s, b, "delivering", "accepted", nil)
	assert.Equal(t, http.StatusConflict, r.Code, "chuyển không có trong máy trạng thái")
	assert.Equal(t, "INVALID_TRANSITION", r.ErrCode(t))
}

type historyPage struct {
	Orders []struct {
		ID        string    `json:"id"`
		Status    string    `json:"status"`
		PartnerID string    `json:"partner_id"`
		CreatedAt time.Time `json:"created_at"`
	} `json:"orders"`
	NextCursor *string   `json:"next_cursor"`
	ServerTime time.Time `json:"server_time"`
}

func (p historyPage) ids() []string {
	out := make([]string, len(p.Orders))
	for i, o := range p.Orders {
		out[i] = o.ID
	}
	return out
}

func getHistory(t *testing.T, s *client, query string) historyPage {
	t.Helper()
	r := s.get("/api/seller/orders?" + query)
	require.Equal(t, http.StatusOK, r.Code, string(r.Body))
	assert.Equal(t, "no-store", r.Header.Get("Cache-Control"))
	var p historyPage
	r.JSON(t, &p)
	return p
}

func TestSellerOrderHistory(t *testing.T) {
	h := newHarness(t)
	f := h.fixture()
	other := testdb.SeedPartner(t, h.DB, testdb.PartnerOpts{Name: "Quán B"})
	otherToken := testdb.SeedQR(t, h.DB, other, "TABLE00002", "Bàn 2")
	cust, _ := h.customer()
	s := h.seller()
	placedAt := func(id string, at time.Time) {
		require.NoError(t, h.DB.Exec("UPDATE orders SET created_at = ? WHERE id = ?", at, id).Error)
	}

	// Hai đầu khoảng tính theo giờ Việt Nam: [01/10 00:00, 01/11 00:00).
	_, before := cust.placeOrder(f.Token, orderBody(line(f.Tea, 1)))
	_, first := cust.placeOrder(f.Token, orderBody(line(f.Tea, 1)))
	_, last := cust.placeOrder(otherToken, orderBody(line(f.Water, 1)))
	_, after := cust.placeOrder(f.Token, orderBody(line(f.Tea, 1)))
	placedAt(before, time.Date(2026, 9, 30, 23, 59, 59, 999999000, h.Loc))
	placedAt(first, time.Date(2026, 10, 1, 0, 0, 0, 0, h.Loc))
	placedAt(last, time.Date(2026, 10, 31, 23, 59, 59, 0, h.Loc))
	placedAt(after, time.Date(2026, 11, 1, 0, 0, 0, 0, h.Loc))
	require.Equal(t, http.StatusOK, transition(s, first, "sent", "rejected", nil).Code)

	p := getHistory(t, s, "from=2026-10-01&to=2026-10-31")
	assert.Equal(t, []string{last, first}, p.ids(), "mọi trạng thái, mới nhất trước, đúng biên ngày")
	assert.Nil(t, p.NextCursor)
	assert.False(t, p.ServerTime.IsZero())

	p = getHistory(t, s, "from=2026-10-01&to=2026-10-31&status=rejected")
	assert.Equal(t, []string{first}, p.ids())
	p = getHistory(t, s, "from=2026-10-01&to=2026-10-31&partner_id="+other.String())
	assert.Equal(t, []string{last}, p.ids())
	p = getHistory(t, s, "from=2026-10-01&to=2026-10-31&partner_id="+uuid.NewString())
	assert.Empty(t, p.ids(), "quán không tồn tại trả danh sách rỗng")
	p = getHistory(t, s, "from=2026-09-30&to=2026-09-30")
	assert.Equal(t, []string{before}, p.ids())

	// 205 đơn trong tháng 12, 150 đơn trùng một created_at để ranh giới trang rơi giữa nhóm trùng.
	tie := time.Date(2026, 12, 5, 10, 0, 0, 123456000, h.Loc)
	clone := func(n int, at time.Time, step time.Duration, prefix string) {
		require.NoError(t, h.DB.Exec(`INSERT INTO orders (code, qr_token, partner_id, partner_name, table_label, items, total,
			status, client_id, idempotency_key, created_at, updated_at)
			SELECT ? || g, qr_token, partner_id, partner_name, table_label, items, total,
				'sent', client_id, gen_random_uuid()::text, ?::timestamptz + g * ? * interval '1 second', now()
			FROM orders, generate_series(1, ?) g WHERE id = ?`,
			prefix, at, int(step.Seconds()), n, after).Error)
	}
	clone(150, tie, 0, "TIE")
	clone(55, time.Date(2026, 12, 20, 8, 0, 0, 0, h.Loc), time.Minute, "SEQ")

	seen := map[string]bool{}
	var sizes []int
	query := "from=2026-12-01&to=2026-12-31"
	cursor := ""
	for {
		q := query
		if cursor != "" {
			q += "&cursor=" + url.QueryEscape(cursor)
		}
		p := getHistory(t, s, q)
		sizes = append(sizes, len(p.Orders))
		for i, o := range p.Orders {
			assert.False(t, seen[o.ID], "đơn %s bị lặp", o.ID)
			seen[o.ID] = true
			if i > 0 {
				assert.False(t, o.CreatedAt.After(p.Orders[i-1].CreatedAt), "mới nhất trước")
			}
		}
		if p.NextCursor == nil {
			break
		}
		cursor = *p.NextCursor
		require.Less(t, len(sizes), 5, "phân trang không dừng")
	}
	assert.Equal(t, []int{100, 100, 5}, sizes)
	assert.Len(t, seen, 205)

	for _, tc := range []struct{ query, field string }{
		{"from=2026-10-01", "to"},
		{"to=2026-10-01", "from"},
		{"from=&to=", "from"},
		{"from=2026-10-31&to=2026-10-01", "to"},
		{"from=2025-01-01&to=2026-01-02", "to"},
		{"from=01/10/2026&to=2026-10-31", "from"},
		{"scope=open&from=2026-10-01&to=2026-10-31", "scope"},
		{"updated_after=2026-10-01T00:00:00Z&from=2026-10-01&to=2026-10-31", "scope"},
		{"from=2026-10-01&to=2026-10-31&status=open", "status"},
		{"from=2026-10-01&to=2026-10-31&partner_id=abc", "partner_id"},
		{"from=2026-10-01&to=2026-10-31&cursor=abc", "cursor"},
	} {
		r := s.get("/api/seller/orders?" + tc.query)
		require.Equal(t, http.StatusUnprocessableEntity, r.Code, tc.query)
		assert.Equal(t, "VALIDATION", r.ErrCode(t), tc.query)
		var e struct {
			Error struct {
				Details struct {
					Fields map[string]string `json:"fields"`
				} `json:"details"`
			} `json:"error"`
		}
		r.JSON(t, &e)
		assert.Contains(t, e.Error.Details.Fields, tc.field, tc.query)
	}

	r := s.get("/api/seller/orders?scope=open")
	require.Equal(t, http.StatusOK, r.Code)
	assert.NotContains(t, r.Map(t), "next_cursor", "scope/updated_after giữ nguyên dạng phản hồi")
	assert.Equal(t, http.StatusUnauthorized, h.client(nil).get("/api/seller/orders?from=2026-10-01&to=2026-10-31").Code)
}

func TestSchedulerCancelsExpiredSentOrders(t *testing.T) {
	h := newHarness(t)
	f := h.fixture()
	cust, _ := h.customer()
	s := h.seller()
	start := h.Clock.Now()
	_, expired := cust.placeOrder(f.Token, orderBody(line(f.Tea, 1)))
	_, accepted := cust.placeOrder(f.Token, orderBody(line(f.Tea, 1)))
	require.Equal(t, http.StatusOK, transition(s, accepted, "sent", "accepted", nil).Code)

	sellerWS := s.ws("/ws/seller")
	h.waitSubscribed(realtime.TopicSeller, 1)

	h.Clock.Set(start.Add(4*time.Minute + 59*time.Second))
	assert.Zero(t, h.App.Scheduler.CancelExpired(t.Context()))
	_, fresh := cust.placeOrder(f.Token, orderBody(line(f.Water, 1)))

	h.Clock.Set(start.Add(5*time.Minute + time.Second))
	assert.Equal(t, 1, h.App.Scheduler.CancelExpired(t.Context()))

	var o orderView
	cust.get("/api/orders/"+expired).JSON(t, &o)
	assert.Equal(t, "cancelled", o.Status)
	assert.Equal(t, "timeout", *o.CancelReason)
	cust.get("/api/orders/"+fresh).JSON(t, &o)
	assert.Equal(t, "sent", o.Status)

	var ev struct{ Actor, Reason string }
	h.DB.Raw("SELECT actor, reason FROM order_events WHERE order_id = ? AND to_status = 'cancelled'", expired).Scan(&ev)
	assert.Equal(t, "system", ev.Actor)
	assert.Equal(t, "timeout", ev.Reason)
	var outbox int64
	h.DB.Table("notification_outbox").Where("order_id = ? AND kind = 'customer_status'", expired).Count(&outbox)
	assert.Equal(t, int64(1), outbox)

	m := next(t, sellerWS, realtime.TypeOrderUpdated)
	assert.Contains(t, string(m.Data), `"cancelled"`)
}

func TestPurgePhonesAfter90Days(t *testing.T) {
	h := newHarness(t)
	f := h.fixture()
	cust, _ := h.customer()
	s := h.seller()
	_, id := cust.placeOrder(f.Token, orderBody(line(f.Tea, 1)))
	require.Equal(t, http.StatusOK, transition(s, id, "sent", "accepted", nil).Code)
	h.DB.Exec("UPDATE notification_outbox SET status = 'sent' WHERE order_id = ? AND kind = 'customer_status'", id)

	h.Clock.Advance(89 * 24 * time.Hour)
	orders, outbox, err := h.App.Scheduler.PurgePhones(t.Context())
	require.NoError(t, err)
	assert.Zero(t, orders)
	assert.Zero(t, outbox)

	h.Clock.Advance(2 * 24 * time.Hour)
	orders, outbox, err = h.App.Scheduler.PurgePhones(t.Context())
	require.NoError(t, err)
	assert.Equal(t, int64(1), orders)
	assert.Equal(t, int64(1), outbox)

	var row struct{ CustomerPhone *string }
	h.DB.Raw("SELECT customer_phone FROM orders WHERE id = ?", id).Scan(&row)
	assert.Nil(t, row.CustomerPhone)
	var recipients []string
	h.DB.Table("notification_outbox").Where("order_id = ?", id).Order("id").Pluck("recipient", &recipients)
	assert.Equal(t, []string{"seller", ""}, recipients)
}

func TestRealtimeOrderEvents(t *testing.T) {
	h := newHarness(t)
	f := h.fixture()
	s := h.seller()
	cust, cid := h.customer()
	sellerWS := s.ws("/ws/seller")
	h.waitSubscribed(realtime.TopicSeller, 1)

	_, id := cust.placeOrder(f.Token, orderBody(line(f.Tea, 1)))
	m := next(t, sellerWS, realtime.TypeOrderCreated)
	var created orderView
	require.NoError(t, json.Unmarshal(m.Data, &created))
	assert.Equal(t, id, created.ID)
	assert.Equal(t, "0901234567", *created.CustomerPhone)

	custWS := h.client(nil).ws("/ws/customer?client_id=" + cid + "&order=" + id)
	h.waitSubscribed(realtime.TopicOrder(id), 1)
	require.Equal(t, http.StatusOK, transition(s, id, "sent", "accepted", nil).Code)
	m = next(t, custWS, realtime.TypeOrderUpdated)
	var upd orderView
	require.NoError(t, json.Unmarshal(m.Data, &upd))
	assert.Equal(t, "accepted", upd.Status)
	assert.NotContains(t, string(m.Data), "0901234567", "khách không nhận SĐT qua WS")
}
