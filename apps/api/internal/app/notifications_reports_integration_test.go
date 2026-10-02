//go:build integration

package app_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"sidecup/api/internal/platform/db/testdb"
	"sidecup/api/internal/platform/realtime"
)

type pending struct {
	Notifications []struct {
		ID        int64           `json:"id"`
		Kind      string          `json:"kind"`
		Recipient string          `json:"recipient"`
		Payload   json.RawMessage `json:"payload"`
		Attempts  int             `json:"attempts"`
	} `json:"notifications"`
}

func TestInternalEndpointsRequireBearer(t *testing.T) {
	h := newHarness(t)
	for _, c := range []*client{h.client(nil), h.client(map[string]string{"Authorization": "Bearer wrong"}), h.seller()} {
		assert.Equal(t, http.StatusUnauthorized, c.get("/internal/notifications/pending").Code)
	}
}

func TestOutboxClaimSoftLockAndAck(t *testing.T) {
	h := newHarness(t)
	f := h.fixture()
	cust, _ := h.customer()
	for range 3 {
		cust.placeOrder(f.Token, orderBody(line(f.Tea, 1)))
	}
	n := h.notifier()

	var first, second pending
	n.get("/internal/notifications/pending?limit=2").JSON(t, &first)
	n.get("/internal/notifications/pending?limit=20").JSON(t, &second)
	require.Len(t, first.Notifications, 2)
	require.Len(t, second.Notifications, 1, "hai lần gọi liên tiếp không trả trùng tin")
	assert.NotContains(t, []int64{first.Notifications[0].ID, first.Notifications[1].ID}, second.Notifications[0].ID)
	assert.Equal(t, "seller_new_order", first.Notifications[0].Kind)
	var payload map[string]any
	require.NoError(t, json.Unmarshal(first.Notifications[0].Payload, &payload))
	assert.Equal(t, "Quán test", payload["partner_name"])
	assert.Contains(t, payload["seller_url"], "http://sidecup.test/seller/orders/")
	assert.Equal(t, "1 Trà đá", payload["items_summary"])

	var empty pending
	n.get("/internal/notifications/pending").JSON(t, &empty)
	assert.Empty(t, empty.Notifications, "đang bị khoá mềm")

	// Notifier không ack trong 60 giây → tin quay lại hàng đợi.
	h.Clock.Advance(61 * time.Second)
	var again pending
	n.get("/internal/notifications/pending").JSON(t, &again)
	assert.Len(t, again.Notifications, 3)

	id := again.Notifications[0].ID
	r := n.post(fmt.Sprintf("/internal/notifications/%d/ack", id), map[string]any{"ok": true})
	require.Equal(t, http.StatusOK, r.Code, string(r.Body))
	assert.Equal(t, "sent", r.Map(t)["status"])
	r = n.post(fmt.Sprintf("/internal/notifications/%d/ack", id), map[string]any{"ok": false, "error": "late"})
	assert.Equal(t, "sent", r.Map(t)["status"], "ack lại tin đã gửi là no-op")
	assert.Equal(t, http.StatusNotFound, n.post("/internal/notifications/999999/ack", map[string]any{"ok": true}).Code)
	assert.Equal(t, http.StatusUnprocessableEntity, n.post(fmt.Sprintf("/internal/notifications/%d/ack", id), map[string]any{}).Code)
}

func TestOutboxFailsAfterThreeAttemptsAndAlertsSeller(t *testing.T) {
	h := newHarness(t)
	f := h.fixture()
	cust, _ := h.customer()
	cust.placeOrder(f.Token, orderBody(line(f.Tea, 1)))
	n := h.notifier()
	s := h.seller()
	n.post("/internal/notifier/heartbeat", map[string]any{"session_ok": true})
	sellerWS := s.ws("/ws/seller")
	h.waitSubscribed(realtime.TopicSeller, 1)

	var id int64
	for attempt := 1; attempt <= 3; attempt++ {
		var p pending
		n.get("/internal/notifications/pending").JSON(t, &p)
		require.Len(t, p.Notifications, 1, "lần %d", attempt)
		id = p.Notifications[0].ID
		assert.Equal(t, attempt-1, p.Notifications[0].Attempts)
		r := n.post(fmt.Sprintf("/internal/notifications/%d/ack", id), map[string]any{"ok": false, "error": "zalo session expired"})
		require.Equal(t, http.StatusOK, r.Code)
		if attempt < 3 {
			assert.Equal(t, "pending", r.Map(t)["status"])
			var none pending
			n.get("/internal/notifications/pending").JSON(t, &none)
			assert.Empty(t, none.Notifications, "đang chờ backoff")
			h.Clock.Advance(time.Duration(30<<(attempt-1))*time.Second + time.Second)
		} else {
			assert.Equal(t, "failed", r.Map(t)["status"])
		}
	}
	var last struct{ LastError string }
	h.DB.Raw("SELECT last_error FROM notification_outbox WHERE id = ?", id).Scan(&last)
	assert.Equal(t, "zalo session expired", last.LastError)

	m := next(t, sellerWS, realtime.TypeNotifierStatus)
	var st map[string]any
	require.NoError(t, json.Unmarshal(m.Data, &st))
	assert.Equal(t, float64(1), st["failed_last_hour"])
}

func TestHeartbeatAndStatus(t *testing.T) {
	h := newHarness(t)
	s := h.seller()
	n := h.notifier()

	st := s.get("/api/seller/notifier/status").Map(t)
	assert.Equal(t, false, st["healthy"], "chưa từng có heartbeat")

	r := n.post("/internal/notifier/heartbeat", map[string]any{"session_ok": true, "message": "ok"})
	require.Equal(t, http.StatusOK, r.Code, string(r.Body))
	st = s.get("/api/seller/notifier/status").Map(t)
	assert.Equal(t, true, st["healthy"])

	h.Clock.Advance(91 * time.Second)
	st = s.get("/api/seller/notifier/status").Map(t)
	assert.Equal(t, false, st["healthy"], "heartbeat quá 90 giây")

	n.post("/internal/notifier/heartbeat", map[string]any{"session_ok": false, "message": "đăng xuất"})
	st = s.get("/api/seller/notifier/status").Map(t)
	assert.Equal(t, false, st["healthy"])
	assert.Equal(t, "đăng xuất", st["message"])
}

func TestVietQREndpoint(t *testing.T) {
	h := newHarness(t)
	f := h.fixture()
	cust, _ := h.customer()
	s := h.seller()
	_, id := cust.placeOrder(f.Token, orderBody(line(f.Tea, 3)))

	r := s.get("/api/seller/orders/" + id + "/vietqr")
	assert.Equal(t, http.StatusConflict, r.Code)
	assert.Equal(t, "BANK_NOT_CONFIGURED", r.ErrCode(t))

	testdb.SetBank(t, h.DB, "970415", "0123456789", "NGUYEN VAN A")
	r = s.get("/api/seller/orders/" + id + "/vietqr")
	require.Equal(t, http.StatusOK, r.Code, string(r.Body))
	var v struct {
		Payload         string `json:"payload"`
		Amount          int64  `json:"amount"`
		Purpose         string `json:"purpose"`
		BankAccountName string `json:"bank_account_name"`
	}
	r.JSON(t, &v)
	assert.Equal(t, int64(45000), v.Amount)
	assert.Len(t, v.Purpose, 6)
	assert.True(t, strings.HasPrefix(v.Payload, "000201010212"))
	assert.Contains(t, v.Payload, "540545000")
	assert.Contains(t, v.Payload, "0806"+v.Purpose)
	assert.Equal(t, "NGUYEN VAN A", v.BankAccountName)

	assert.Equal(t, http.StatusUnauthorized, h.client(nil).get("/api/seller/orders/"+id+"/vietqr").Code)
}

// reportFixture: 3 đơn paid 45.000đ, 1 đơn failed, 1 điều chỉnh -5.000đ trong kỳ hiện tại.
func reportFixture(t *testing.T, h *harness, f fixture) {
	t.Helper()
	cust, _ := h.customer()
	s := h.seller()
	for range 3 {
		_, id := cust.placeOrder(f.Token, orderBody(line(f.Tea, 3)))
		transition(s, id, "sent", "accepted", nil)
		transition(s, id, "accepted", "delivering", nil)
		require.Equal(t, http.StatusOK, transition(s, id, "delivering", "paid", map[string]any{"payment_method": "transfer"}).Code)
	}
	_, failed := cust.placeOrder(f.Token, orderBody(line(f.Water, 1)))
	transition(s, failed, "sent", "accepted", nil)
	transition(s, failed, "accepted", "delivering", nil)
	require.Equal(t, http.StatusOK, transition(s, failed, "delivering", "failed", nil).Code)
	_, open := cust.placeOrder(f.Token, orderBody(line(f.Tea, 1)))
	_ = open

	r := s.post("/api/seller/adjustments", map[string]any{"partner_id": f.PartnerID, "amount": -5000, "reason": "Trả nhầm tuần trước"})
	require.Equal(t, http.StatusCreated, r.Code, string(r.Body))
}

func TestCommissionReportMatchesFixture(t *testing.T) {
	h := newHarness(t)
	f := h.fixture()
	other := testdb.SeedPartner(t, h.DB, testdb.PartnerOpts{Name: "Quán khác", Period: "month"})
	reportFixture(t, h, f)
	s := h.seller()

	r := s.get("/api/seller/reports/commission?period=current")
	require.Equal(t, http.StatusOK, r.Code, string(r.Body))
	var rep struct {
		Rows []struct {
			PartnerID        string `json:"partner_id"`
			PartnerName      string `json:"partner_name"`
			PayoutPeriod     string `json:"payout_period"`
			From, To         string
			PaidCount        int64 `json:"paid_count"`
			Revenue          int64 `json:"revenue"`
			FailedCount      int64 `json:"failed_count"`
			Commission       int64 `json:"commission"`
			AdjustmentsTotal int64 `json:"adjustments_total"`
			Net              int64 `json:"net"`
		} `json:"rows"`
		Total struct {
			Net int64 `json:"net"`
		} `json:"total"`
	}
	r.JSON(t, &rep)
	require.Len(t, rep.Rows, 2)
	row := rep.Rows[1]
	assert.Equal(t, "Quán test", row.PartnerName)
	assert.Equal(t, int64(3), row.PaidCount)
	assert.Equal(t, int64(135000), row.Revenue)
	assert.Equal(t, int64(20250), row.Commission)
	assert.Equal(t, int64(1), row.FailedCount)
	assert.Equal(t, int64(-5000), row.AdjustmentsTotal)
	assert.Equal(t, int64(15250), row.Net)
	assert.Equal(t, int64(15250), rep.Total.Net)
	assert.Equal(t, other.String(), rep.Rows[0].PartnerID)
	assert.Equal(t, "month", rep.Rows[0].PayoutPeriod)
	assert.True(t, strings.HasSuffix(rep.Rows[0].From, "-01"), "kỳ tháng bắt đầu ngày 1")

	// Đổi tỷ lệ hoa hồng sau khi đã thu tiền không làm đổi số đã ghi.
	h.DB.Exec("UPDATE partners SET commission_rate = 0.5 WHERE id = ?", f.PartnerID)
	r = s.get("/api/seller/reports/commission?partner_id=" + f.PartnerID.String() + "&period=current")
	r.JSON(t, &rep)
	require.Len(t, rep.Rows, 1)
	assert.Equal(t, int64(20250), rep.Rows[0].Commission)

	today := h.Clock.Now().Format(time.DateOnly)
	r = s.get("/api/seller/reports/commission?from=" + today + "&to=" + today)
	r.JSON(t, &rep)
	assert.Equal(t, int64(15250), rep.Total.Net)

	r = s.get("/api/seller/reports/commission?period=previous&partner_id=" + f.PartnerID.String())
	r.JSON(t, &rep)
	assert.Equal(t, int64(0), rep.Rows[0].PaidCount)
}

func TestCommissionExportHasNoPhone(t *testing.T) {
	h := newHarness(t)
	f := h.fixture()
	h.DB.Exec("UPDATE partners SET name = 'Quán Cơm Bà Năm' WHERE id = ?", f.PartnerID)
	reportFixture(t, h, f)
	s := h.seller()

	r := s.get("/api/seller/reports/commission/export")
	assert.Equal(t, http.StatusUnprocessableEntity, r.Code, "bắt buộc chọn quán")

	r = s.get("/api/seller/reports/commission/export?partner_id=" + f.PartnerID.String() + "&period=current")
	require.Equal(t, http.StatusOK, r.Code, string(r.Body))
	assert.Equal(t, "text/plain; charset=utf-8", r.Header.Get("Content-Type"))
	assert.Contains(t, r.Header.Get("Content-Disposition"), `filename="hoa-hong-quan-com-ba-nam-`)
	body := string(r.Body)
	assert.Contains(t, body, "BÁO CÁO HOA HỒNG — Quán Cơm Bà Năm")
	assert.Contains(t, body, "Đơn đã thu tiền: 3   Doanh thu: 135.000đ")
	assert.Contains(t, body, "Hoa hồng 15%: 20.250đ")
	assert.Contains(t, body, "Điều chỉnh: -5.000đ (1 bản ghi)")
	assert.Contains(t, body, "Phải trả: 15.250đ")
	assert.Contains(t, body, "(tuần)")
	assert.False(t, regexp.MustCompile(`0\d{9}`).MatchString(body), "không có SĐT")
}

func TestAdjustments(t *testing.T) {
	h := newHarness(t)
	f := h.fixture()
	cust, _ := h.customer()
	s := h.seller()
	r, _ := cust.placeOrder(f.Token, orderBody(line(f.Tea, 1)))
	var o orderView
	r.JSON(t, &o)

	r = s.post("/api/seller/adjustments", map[string]any{"partner_id": f.PartnerID, "amount": 0, "reason": "x"})
	assert.Equal(t, http.StatusUnprocessableEntity, r.Code)
	r = s.post("/api/seller/adjustments", map[string]any{"partner_id": f.PartnerID, "amount": 1000, "reason": "  "})
	assert.Equal(t, http.StatusUnprocessableEntity, r.Code)
	r = s.post("/api/seller/adjustments", map[string]any{"partner_id": f.PartnerID, "amount": 1000, "reason": "x", "order_code": "ZZZZZZ"})
	assert.Equal(t, http.StatusUnprocessableEntity, r.Code)

	r = s.post("/api/seller/adjustments", map[string]any{"partner_id": f.PartnerID, "amount": 2000, "reason": "Bù tiền ly vỡ", "order_code": strings.ToLower(o.Code)})
	require.Equal(t, http.StatusCreated, r.Code, string(r.Body))
	assert.Equal(t, o.Code, r.Map(t)["order_code"])

	var list struct {
		Adjustments []map[string]any `json:"adjustments"`
	}
	s.get("/api/seller/adjustments?partner_id="+f.PartnerID.String()).JSON(t, &list)
	require.Len(t, list.Adjustments, 1)
	assert.Equal(t, "Quán test", list.Adjustments[0]["partner_name"])
	assert.Equal(t, "seller", list.Adjustments[0]["created_by"])
}

func TestFunnelCountsDistinctDevices(t *testing.T) {
	h := newHarness(t)
	f := h.fixture()
	s := h.seller()
	a, _ := h.customer()
	b, _ := h.customer()
	c, _ := h.customer()
	for _, cl := range []*client{a, a, b, c} {
		cl.get("/api/t/" + f.Token)
	}
	_, id := a.placeOrder(f.Token, orderBody(line(f.Tea, 1)))
	transition(s, id, "sent", "accepted", nil)
	transition(s, id, "accepted", "delivering", nil)
	transition(s, id, "delivering", "paid", map[string]any{"payment_method": "cash"})
	b.placeOrder(f.Token, orderBody(line(f.Water, 1)))

	r := s.get("/api/seller/reports/funnel")
	require.Equal(t, http.StatusOK, r.Code, string(r.Body))
	var rep struct {
		Rows []struct {
			PartnerName string `json:"partner_name"`
			Day         string `json:"day"`
			Views       int64  `json:"views"`
			Orders      int64  `json:"orders"`
			Paid        int64  `json:"paid"`
		} `json:"rows"`
	}
	r.JSON(t, &rep)
	require.Len(t, rep.Rows, 1)
	assert.Equal(t, h.Clock.Now().Format(time.DateOnly), rep.Rows[0].Day)
	assert.Equal(t, int64(3), rep.Rows[0].Views)
	assert.Equal(t, int64(2), rep.Rows[0].Orders)
	assert.Equal(t, int64(1), rep.Rows[0].Paid)
}

func TestCustomerNotificationFailureDoesNotAlertSeller(t *testing.T) {
	h := newHarness(t)
	f := h.fixture()
	cust, _ := h.customer()
	s := h.seller()
	n := h.notifier()
	_, id := cust.placeOrder(f.Token, orderBody(line(f.Tea, 1)))
	require.Equal(t, http.StatusOK, transition(s, id, "sent", "accepted", nil).Code)

	for attempt := 1; attempt <= 3; attempt++ {
		var p pending
		n.get("/internal/notifications/pending").JSON(t, &p)
		for _, item := range p.Notifications {
			ok := item.Kind == "seller_new_order"
			n.post(fmt.Sprintf("/internal/notifications/%d/ack", item.ID), map[string]any{"ok": ok, "error": "khách chặn tin người lạ"})
		}
		h.Clock.Advance(2 * time.Minute)
	}
	var failed int64
	h.DB.Table("notification_outbox").Where("kind = 'customer_status' AND status = 'failed'").Count(&failed)
	require.Equal(t, int64(1), failed)

	n.post("/internal/notifier/heartbeat", map[string]any{"session_ok": true})
	st := s.get("/api/seller/notifier/status").Map(t)
	assert.Equal(t, true, st["healthy"])
	assert.Equal(t, float64(0), st["failed_last_hour"], "tin gửi khách lỗi chỉ ghi log, không bật cảnh báo đỏ")
}

func TestStaleNotificationsExpire(t *testing.T) {
	h := newHarness(t)
	f := h.fixture()
	cust, _ := h.customer()
	s := h.seller()
	n := h.notifier()
	cust.placeOrder(f.Token, orderBody(line(f.Tea, 1)))

	h.Clock.Advance(31 * time.Minute)
	var p pending
	n.get("/internal/notifications/pending").JSON(t, &p)
	assert.Empty(t, p.Notifications, "tin quá 30 phút không gửi nữa")
	var row struct{ Status, LastError string }
	h.DB.Raw("SELECT status, last_error FROM notification_outbox LIMIT 1").Scan(&row)
	assert.Equal(t, "failed", row.Status)
	assert.Equal(t, "expired", row.LastError)

	n.post("/internal/notifier/heartbeat", map[string]any{"session_ok": true})
	st := s.get("/api/seller/notifier/status").Map(t)
	assert.Equal(t, float64(0), st["failed_last_hour"], "tin hết hạn không tính là lỗi gửi")
}
