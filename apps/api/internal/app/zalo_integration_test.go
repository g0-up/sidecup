//go:build integration

package app_test

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"sidecup/api/internal/features/notifications"
	"sidecup/api/internal/features/zalo"
	"sidecup/api/internal/platform/config"
)

func withZaloKey(cfg *config.Config) { cfg.ZaloCredentialKey = strings.Repeat("k", 32) }

func TestCreateOrderWithoutPhoneSendsNoCustomerMessages(t *testing.T) {
	h := newHarness(t)
	f := h.fixture()
	cust, _ := h.customer()
	s := h.seller()

	for _, phone := range []any{nil, "", "   "} {
		body := map[string]any{"items": []any{line(f.Tea, 1)}}
		if phone != nil {
			body["phone"] = phone
		}
		r, id := cust.placeOrder(f.Token, body)
		require.Equal(t, http.StatusCreated, r.Code, string(r.Body))

		var stored struct{ CustomerPhone *string }
		require.NoError(t, h.DB.Raw("SELECT customer_phone FROM orders WHERE id = ?", id).Scan(&stored).Error)
		assert.Nil(t, stored.CustomerPhone, "phone=%v", phone)

		require.Equal(t, http.StatusOK, transition(s, id, "sent", "accepted", nil).Code)
		var outbox int64
		h.DB.Table("notification_outbox").Where("order_id = ? AND kind = 'customer_status'", id).Count(&outbox)
		assert.Zero(t, outbox, "không SĐT thì không có tin cho khách")
	}

	r, _ := cust.placeOrder(f.Token, map[string]any{"items": []any{line(f.Tea, 1)}, "phone": "123"})
	assert.Equal(t, http.StatusUnprocessableEntity, r.Code)
	assert.Contains(t, string(r.Body), `"phone"`)
}

func TestClaimKindLeavesSellerMessagesAlone(t *testing.T) {
	h := newHarness(t)
	f := h.fixture()
	cust, _ := h.customer()
	s := h.seller()
	_, id := cust.placeOrder(f.Token, orderBody(line(f.Tea, 1)))
	require.Equal(t, http.StatusOK, transition(s, id, "sent", "accepted", nil).Code)

	ctx := context.Background()
	items, err := h.App.Notifier.ClaimKind(ctx, notifications.KindCustomerStatus, 5)
	require.NoError(t, err)
	require.Len(t, items, 1)
	assert.Equal(t, notifications.KindCustomerStatus, items[0].Kind)
	assert.Equal(t, "0901234567", items[0].Recipient)

	require.NoError(t, h.App.Notifier.AckPermanent(ctx, items[0].ID, "không tìm thấy Zalo"))
	require.NoError(t, h.App.Notifier.AckPermanent(ctx, items[0].ID, "lần hai"), "ack lại tin đã xong là no-op")
	var row struct {
		Status    string
		Attempts  int
		LastError string
	}
	h.DB.Raw("SELECT status, attempts, last_error FROM notification_outbox WHERE id = ?", items[0].ID).Scan(&row)
	assert.Equal(t, "failed", row.Status)
	assert.Equal(t, 1, row.Attempts)
	assert.Equal(t, "không tìm thấy Zalo", row.LastError)

	var sellerPending int64
	h.DB.Table("notification_outbox").Where("kind = 'seller_new_order' AND status = 'pending'").Count(&sellerPending)
	assert.Equal(t, int64(1), sellerPending)

	st := s.get("/api/seller/notifier/status").Map(t)
	assert.Equal(t, float64(0), st["failed_last_hour"], "tin khách failed không bật cảnh báo đỏ")
}

type recordingSender struct {
	mu   sync.Mutex
	sent []string
}

func (r *recordingSender) SendToPhone(_ context.Context, phone, text string) (string, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.sent = append(r.sent, phone+"|"+text)
	return "msg", nil
}

func (r *recordingSender) SessionHealthy(context.Context) (bool, string) { return true, "" }

func (r *recordingSender) count() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.sent)
}

func TestDispatcherDeliversCustomerStatusAndBeats(t *testing.T) {
	h := newHarness(t)
	f := h.fixture()
	cust, _ := h.customer()
	s := h.seller()
	_, id := cust.placeOrder(f.Token, orderBody(line(f.Tea, 2)))
	require.Equal(t, http.StatusOK, transition(s, id, "sent", "accepted", nil).Code)

	sender := &recordingSender{}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { _ = notifications.NewDispatcher(h.App.Notifier, sender).Run(ctx); close(done) }()
	require.Eventually(t, func() bool { return sender.count() == 1 }, 5*time.Second, 20*time.Millisecond)
	require.Eventually(t, func() bool {
		var status string
		h.DB.Raw("SELECT status FROM notification_outbox WHERE order_id = ? AND kind = 'customer_status'", id).Scan(&status)
		return status == "sent"
	}, 5*time.Second, 20*time.Millisecond)
	require.Eventually(t, func() bool {
		return s.get("/api/seller/notifier/status").Map(t)["healthy"] == true
	}, 5*time.Second, 20*time.Millisecond, "dispatcher ghi heartbeat thay notifier ngoài")
	cancel()
	<-done

	assert.True(t, strings.HasPrefix(sender.sent[0], "0901234567|Sidecup – đơn #"))
	assert.Contains(t, sender.sent[0], "Trạng thái: Quán đã nhận, đang pha")
	assert.Contains(t, sender.sent[0], "Tổng: 30.000đ")
}

func TestZaloRoutesWithoutKeyReportNotConfigured(t *testing.T) {
	h := newHarness(t)
	require.Nil(t, h.App.Zalo)
	s := h.seller()

	st := s.get("/api/seller/zalo").Map(t)
	assert.Equal(t, false, st["configured"])

	r := s.post("/api/seller/zalo/link", map[string]any{"consent_version": "2026-10-02"})
	assert.Equal(t, http.StatusServiceUnavailable, r.Code)
	assert.Equal(t, "ZALO_NOT_CONFIGURED", r.ErrCode(t))
}

func TestZaloRoutesWithKeyRequireSellerAndStartUnlinked(t *testing.T) {
	h := newHarness(t, withZaloKey)
	require.NotNil(t, h.App.Zalo)

	assert.Equal(t, http.StatusUnauthorized, h.client(nil).get("/api/seller/zalo").Code)

	s := h.seller()
	st := s.get("/api/seller/zalo").Map(t)
	assert.Equal(t, true, st["configured"])
	assert.Equal(t, false, st["linked"])

	r := s.do(http.MethodDelete, "/api/seller/zalo", nil, nil)
	assert.Equal(t, http.StatusNoContent, r.Code)

	ok, msg := h.App.Zalo.SessionHealthy(context.Background())
	assert.True(t, ok, "chưa liên kết không bật banner")
	assert.Empty(t, msg)

	h.DB.Exec(`INSERT INTO zalo_account (id, encrypted_credentials, status, consent_version, consent_at, linked_at)
		VALUES (1, '\x00', 'expired', '2026-10-02', now(), now())`)
	ok, msg = h.App.Zalo.SessionHealthy(context.Background())
	assert.False(t, ok)
	assert.Equal(t, zalo.ExpiredMessage, msg)
}
