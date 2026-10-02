package notifications

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"sidecup/api/internal/features/zalo"
)

type ackCall struct {
	id        int64
	ok        bool
	permanent bool
	msg       string
}

type beatCall struct {
	ok  bool
	msg string
}

type fakeOutbox struct {
	mu        sync.Mutex
	queue     []PendingItem
	kinds     []string
	acks      []ackCall
	beats     []beatCall
	published []bool
}

func (f *fakeOutbox) ClaimKind(_ context.Context, kind string, limit int) ([]PendingItem, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.kinds = append(f.kinds, kind)
	n := min(limit, len(f.queue))
	out := f.queue[:n]
	f.queue = f.queue[n:]
	return out, nil
}

func (f *fakeOutbox) Ack(ctx context.Context, id int64, ok bool, msg string) (AckResp, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	// Như DB thật: context đã huỷ thì câu lệnh không chạy.
	if err := ctx.Err(); err != nil {
		return AckResp{}, err
	}
	f.acks = append(f.acks, ackCall{id: id, ok: ok, msg: msg})
	return AckResp{ID: id}, nil
}

func (f *fakeOutbox) AckPermanent(ctx context.Context, id int64, msg string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return err
	}
	f.acks = append(f.acks, ackCall{id: id, permanent: true, msg: msg})
	return nil
}

func (f *fakeOutbox) Heartbeat(_ context.Context, ok bool, msg string) (Status, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.beats = append(f.beats, beatCall{ok: ok, msg: msg})
	return Status{}, nil
}

func (f *fakeOutbox) PublishStatus(_ context.Context, force bool) (Status, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.published = append(f.published, force)
	return Status{}, nil
}

func (f *fakeOutbox) snapshot() (acks []ackCall, beats []beatCall, kinds []string, published []bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]ackCall(nil), f.acks...), append([]beatCall(nil), f.beats...),
		append([]string(nil), f.kinds...), append([]bool(nil), f.published...)
}

type sentMsg struct{ phone, text string }

// fakeSender trả lỗi theo SĐT; SĐT không có trong errs thì gửi thành công.
type fakeSender struct {
	mu      sync.Mutex
	errs    map[string]error
	healthy bool
	sent    []sentMsg
}

func (s *fakeSender) SendToPhone(_ context.Context, phone, text string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.sent = append(s.sent, sentMsg{phone, text})
	if err := s.errs[phone]; err != nil {
		return "", err
	}
	return "msg-1", nil
}

func (s *fakeSender) SessionHealthy(context.Context) (bool, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.healthy {
		return false, zalo.ExpiredMessage
	}
	return true, ""
}

func (s *fakeSender) sentCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.sent)
}

func item(t *testing.T, id int64, phone, status string) PendingItem {
	t.Helper()
	raw, err := json.Marshal(Payload{Code: fmt.Sprintf("C%d", id), PartnerName: "Văn phòng ABC", TableLabel: "1", Status: status, Total: 45000})
	require.NoError(t, err)
	return PendingItem{ID: id, Kind: KindCustomerStatus, Recipient: phone, Payload: raw}
}

// waits ghi lại mọi lần dispatcher nghỉ; stopAfter lần thì huỷ ctx để Run trả về.
type waits struct {
	mu        sync.Mutex
	got       []time.Duration
	stopAfter int
	cancel    context.CancelFunc
}

func (w *waits) wait(ctx context.Context, d time.Duration, _ <-chan struct{}) bool {
	w.mu.Lock()
	w.got = append(w.got, d)
	n := len(w.got)
	w.mu.Unlock()
	if w.stopAfter > 0 && n >= w.stopAfter {
		w.cancel()
	}
	return ctx.Err() == nil
}

func (w *waits) all() []time.Duration {
	w.mu.Lock()
	defer w.mu.Unlock()
	return append([]time.Duration(nil), w.got...)
}

func newTestDispatcher(box *fakeOutbox, sender CustomerSender, w *waits) *Dispatcher {
	d := newDispatcher(box, sender)
	d.wait = w.wait
	d.gap = func() time.Duration { return 1500 * time.Millisecond }
	d.heartbeat = time.Hour
	return d
}

func TestSendBatchAcksEachOutcome(t *testing.T) {
	box := &fakeOutbox{}
	sender := &fakeSender{healthy: true, errs: map[string]error{
		"0900000002": zalo.ErrRecipientNotFound,
		"0900000003": &url.Error{Op: "Post", URL: "https://chat.zalo.me/api?params=secret", Err: errors.New("timeout")},
	}}
	w := &waits{}
	d := newTestDispatcher(box, sender, w)

	pause := d.sendBatch(context.Background(), []PendingItem{
		item(t, 1, "0900000001", "accepted"),
		item(t, 2, "0900000002", "accepted"),
		item(t, 3, "0900000003", "accepted"),
	})

	assert.False(t, pause)
	acks, _, _, _ := box.snapshot()
	require.Len(t, acks, 3)
	assert.Equal(t, ackCall{id: 1, ok: true}, acks[0])
	assert.Equal(t, ackCall{id: 2, permanent: true, msg: recipientNotFound}, acks[1])
	assert.Equal(t, int64(3), acks[2].id)
	assert.False(t, acks[2].ok)
	assert.False(t, acks[2].permanent)
	assert.NotContains(t, acks[2].msg, "0900000003")
	assert.NotContains(t, acks[2].msg, "secret")
	assert.Contains(t, acks[2].msg, "timeout")

	assert.Equal(t, "0900000001", sender.sent[0].phone)
	assert.Contains(t, sender.sent[0].text, "Trạng thái: Quán đã nhận, đang pha")
	assert.Equal(t, []time.Duration{1500 * time.Millisecond, 1500 * time.Millisecond}, w.all(), "nghỉ giữa hai tin, không nghỉ trước tin đầu")
}

// cancelOnSend giả lập tắt máy đúng lúc Zalo vừa nhận tin: lần gửi thành công nhưng ctx của vòng gửi đã huỷ.
type cancelOnSend struct {
	fakeSender
	cancel context.CancelFunc
}

func (s *cancelOnSend) SendToPhone(ctx context.Context, phone, text string) (string, error) {
	s.cancel()
	return s.fakeSender.SendToPhone(ctx, phone, text)
}

func TestSendBatchAcksADeliveredMessageEvenWhenShuttingDown(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	box := &fakeOutbox{}
	sender := &cancelOnSend{fakeSender: fakeSender{healthy: true}, cancel: cancel}
	d := newTestDispatcher(box, sender, &waits{})

	d.sendBatch(ctx, []PendingItem{item(t, 1, "0900000001", "accepted")})

	acks, _, _, _ := box.snapshot()
	assert.Equal(t, []ackCall{{id: 1, ok: true}}, acks, "mất ack thì hết lease khách nhận trùng tin")
}

func TestSendBatchStopsWithoutAckingWhenTheSessionIsGone(t *testing.T) {
	for _, sessionErr := range []error{zalo.ErrLinkExpired, zalo.ErrNotLinked} {
		box := &fakeOutbox{}
		sender := &fakeSender{healthy: true, errs: map[string]error{"0900000002": sessionErr}}
		d := newTestDispatcher(box, sender, &waits{})

		pause := d.sendBatch(context.Background(), []PendingItem{
			item(t, 1, "0900000001", "paid"),
			item(t, 2, "0900000002", "paid"),
			item(t, 3, "0900000003", "paid"),
		})

		assert.True(t, pause)
		acks, _, _, _ := box.snapshot()
		assert.Equal(t, []ackCall{{id: 1, ok: true}}, acks, "tin lỗi phiên và tin sau nó chờ lease hết hạn, không tốn lượt thử")
		assert.Equal(t, 2, sender.sentCount())
	}
}

func TestSendBatchFailsAnUnreadablePayloadPermanently(t *testing.T) {
	box := &fakeOutbox{}
	sender := &fakeSender{healthy: true}
	d := newTestDispatcher(box, sender, &waits{})

	d.sendBatch(context.Background(), []PendingItem{{ID: 7, Kind: KindCustomerStatus, Recipient: "0900000001", Payload: json.RawMessage(`"x"`)}})

	acks, _, _, _ := box.snapshot()
	require.Len(t, acks, 1)
	assert.True(t, acks[0].permanent)
	assert.Zero(t, sender.sentCount())
}

func TestRunClaimsOnlyCustomerStatusAndIdlesWhenEmpty(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	box := &fakeOutbox{queue: []PendingItem{item(t, 1, "0900000001", "delivering")}}
	sender := &fakeSender{healthy: true}
	w := &waits{stopAfter: 2, cancel: cancel}

	require.NoError(t, newTestDispatcher(box, sender, w).Run(ctx))

	acks, beats, kinds, _ := box.snapshot()
	assert.Equal(t, []ackCall{{id: 1, ok: true}}, acks)
	assert.Equal(t, []string{KindCustomerStatus, KindCustomerStatus}, kinds)
	assert.Equal(t, []time.Duration{1500 * time.Millisecond, dispatchIdle}, w.all(), "lô có tin thì nghỉ ngắn rồi claim tiếp; hàng đợi rỗng thì chờ 2 giây")
	require.NotEmpty(t, beats)
	assert.Equal(t, beatCall{ok: true}, beats[0])
}

func TestRunDoesNotClaimWhileTheSessionIsExpired(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	box := &fakeOutbox{queue: []PendingItem{item(t, 1, "0900000001", "accepted")}}
	sender := &fakeSender{healthy: false}
	w := &waits{stopAfter: 1, cancel: cancel}

	require.NoError(t, newTestDispatcher(box, sender, w).Run(ctx))

	acks, beats, kinds, _ := box.snapshot()
	assert.Empty(t, kinds)
	assert.Empty(t, acks)
	assert.Equal(t, []time.Duration{dispatchPause}, w.all())
	require.NotEmpty(t, beats)
	assert.Equal(t, beatCall{ok: false, msg: zalo.ExpiredMessage}, beats[0])
}

func TestRunPausesAfterASessionFailure(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	box := &fakeOutbox{queue: []PendingItem{item(t, 1, "0900000001", "accepted")}}
	sender := &fakeSender{healthy: true, errs: map[string]error{"0900000001": zalo.ErrNotLinked}}
	w := &waits{stopAfter: 1, cancel: cancel}

	require.NoError(t, newTestDispatcher(box, sender, w).Run(ctx))

	acks, _, _, _ := box.snapshot()
	assert.Empty(t, acks)
	assert.Equal(t, []time.Duration{dispatchPause}, w.all())
}

func TestRunWithoutZaloOnlyBeatsHealthy(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	box := &fakeOutbox{queue: []PendingItem{item(t, 1, "0900000001", "accepted")}}
	d := newTestDispatcher(box, nil, &waits{})

	done := make(chan struct{})
	go func() { _ = d.Run(ctx); close(done) }()
	require.Eventually(t, func() bool { _, beats, _, _ := box.snapshot(); return len(beats) > 0 }, time.Second, 5*time.Millisecond)
	cancel()
	<-done

	_, beats, kinds, _ := box.snapshot()
	assert.Equal(t, beatCall{ok: true}, beats[0])
	assert.Empty(t, kinds, "chưa cấu hình Zalo thì không claim")
}

func TestNudgeBeatsAndForcesAStatusPublish(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	box := &fakeOutbox{}
	d := newTestDispatcher(box, nil, &waits{})

	done := make(chan struct{})
	go func() { _ = d.Run(ctx); close(done) }()
	require.Eventually(t, func() bool { _, beats, _, _ := box.snapshot(); return len(beats) == 1 }, time.Second, 5*time.Millisecond)

	d.Nudge(ctx)
	d.Nudge(ctx) // không chặn kể cả khi tín hiệu trước chưa được đọc
	require.Eventually(t, func() bool { _, _, _, pub := box.snapshot(); return len(pub) > 0 }, time.Second, 5*time.Millisecond)
	cancel()
	<-done

	_, beats, _, published := box.snapshot()
	assert.GreaterOrEqual(t, len(beats), 2)
	assert.True(t, published[0])
}

func TestRandomGapStaysWithinThreeToFiveSeconds(t *testing.T) {
	for range 200 {
		g := randomGap()
		assert.GreaterOrEqual(t, g, 3*time.Second)
		assert.Less(t, g, 5*time.Second)
	}
}
