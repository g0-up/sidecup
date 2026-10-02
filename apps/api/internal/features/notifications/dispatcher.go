package notifications

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"log/slog"
	"math/big"
	"sync"
	"time"

	"sidecup/api/internal/features/zalo"
)

// CustomerSender là phần của zalo.Service mà dispatcher cần; tách ra để test không cần Zalo.
type CustomerSender interface {
	SendToPhone(ctx context.Context, phone, text string) (string, error)
	SessionHealthy(ctx context.Context) (ok bool, message string)
}

// outbox là phần của Service mà dispatcher dùng.
type outbox interface {
	ClaimKind(ctx context.Context, kind string, limit int) ([]PendingItem, error)
	Ack(ctx context.Context, id int64, ok bool, errMsg string) (AckResp, error)
	AckPermanent(ctx context.Context, id int64, errMsg string) error
	Heartbeat(ctx context.Context, sessionOK bool, message string) (Status, error)
	PublishStatus(ctx context.Context, force bool) (Status, error)
}

const (
	dispatchBatch     = 5
	dispatchIdle      = 2 * time.Second
	dispatchPause     = 30 * time.Second
	dispatchHeartbeat = 30 * time.Second
	recipientNotFound = "không tìm thấy Zalo"
)

// Dispatcher gửi tin trạng thái đơn cho khách qua Zalo, chạy trong process API. Gửi tuần tự, có nghỉ giữa
// các tin: gửi dồn dập là cách nhanh nhất để tài khoản cá nhân bị khoá. Nó cũng thay notifier ngoài trong
// việc ghi heartbeat, nên banner đỏ chỉ còn bật khi phiên Zalo hết hạn hoặc chính worker chết.
type Dispatcher struct {
	box    outbox
	sender CustomerSender // nil khi máy chủ chưa cấu hình Zalo: chỉ heartbeat, không claim
	log    *slog.Logger

	idle, pause, heartbeat time.Duration
	gap                    func() time.Duration
	wait                   func(ctx context.Context, d time.Duration, wake <-chan struct{}) bool

	beatNudge chan struct{}
	sendNudge chan struct{}
}

func NewDispatcher(svc *Service, sender CustomerSender) *Dispatcher {
	return newDispatcher(svc, sender)
}

func newDispatcher(box outbox, sender CustomerSender) *Dispatcher {
	return &Dispatcher{
		box: box, sender: sender, log: slog.Default(),
		idle: dispatchIdle, pause: dispatchPause, heartbeat: dispatchHeartbeat,
		gap: randomGap, wait: waitOrWake,
		beatNudge: make(chan struct{}, 1), sendNudge: make(chan struct{}, 1),
	}
}

// Nudge báo trạng thái liên kết vừa đổi: ghi heartbeat ngay và đánh thức vòng gửi đang ngủ. Không bao giờ
// chặn — nó được gọi từ bên trong zalo.Service (kể cả lúc Unlink đang chờ).
func (d *Dispatcher) Nudge(context.Context) {
	for _, ch := range []chan struct{}{d.beatNudge, d.sendNudge} {
		select {
		case ch <- struct{}{}:
		default:
		}
	}
}

// Run chạy tới khi ctx bị huỷ; luôn trả nil để errgroup không kéo server sập theo.
func (d *Dispatcher) Run(ctx context.Context) error {
	var wg sync.WaitGroup
	wg.Go(func() { d.heartbeatLoop(ctx) })
	if d.sender != nil {
		wg.Go(func() { d.sendLoop(ctx) })
	}
	wg.Wait()
	return nil
}

func (d *Dispatcher) heartbeatLoop(ctx context.Context) {
	d.beat(ctx, false)
	t := time.NewTicker(d.heartbeat)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			d.beat(ctx, false)
		case <-d.beatNudge:
			d.beat(ctx, true)
		}
	}
}

func (d *Dispatcher) beat(ctx context.Context, force bool) {
	ok, msg := true, ""
	if d.sender != nil {
		ok, msg = d.sender.SessionHealthy(ctx)
	}
	if _, err := d.box.Heartbeat(ctx, ok, msg); err != nil {
		if ctx.Err() == nil {
			d.log.WarnContext(ctx, "dispatcher heartbeat", "err", err)
		}
		return
	}
	if force {
		if _, err := d.box.PublishStatus(ctx, true); err != nil && ctx.Err() == nil {
			d.log.WarnContext(ctx, "dispatcher publish status", "err", err)
		}
	}
}

func (d *Dispatcher) sendLoop(ctx context.Context) {
	for ctx.Err() == nil {
		// Phiên hết hạn: không claim, để tin nằm pending mà không tốn lượt thử và không login lại liên tục.
		if ok, _ := d.sender.SessionHealthy(ctx); !ok {
			if !d.wait(ctx, d.pause, d.sendNudge) {
				return
			}
			continue
		}
		items, err := d.box.ClaimKind(ctx, KindCustomerStatus, dispatchBatch)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			d.log.WarnContext(ctx, "dispatcher claim", "err", err)
			if !d.wait(ctx, d.pause, nil) {
				return
			}
			continue
		}
		var ok bool
		switch {
		case len(items) == 0:
			ok = d.wait(ctx, d.idle, d.sendNudge)
		case d.sendBatch(ctx, items):
			ok = d.wait(ctx, d.pause, d.sendNudge)
		default:
			// Lô vừa gửi có thể chưa hết hàng đợi; nghỉ như giữa hai tin rồi claim tiếp.
			ok = d.wait(ctx, d.gap(), nil)
		}
		if !ok {
			return
		}
	}
}

// sendBatch gửi từng tin; trả true khi phiên Zalo không dùng được và vòng gửi phải tạm dừng. Tin chưa ack
// tự quay lại hàng đợi khi hết lease 60 giây, không tốn lượt thử.
func (d *Dispatcher) sendBatch(ctx context.Context, items []PendingItem) (pause bool) {
	for i, it := range items {
		if i > 0 && !d.wait(ctx, d.gap(), nil) {
			return false
		}
		var p Payload
		if err := json.Unmarshal(it.Payload, &p); err != nil {
			d.ackPermanent(ctx, it, "payload không đọc được")
			continue
		}
		_, err := d.sender.SendToPhone(ctx, it.Recipient, RenderCustomerStatus(p))
		switch {
		case err == nil:
			// Tin đã tới khách; ack bị huỷ theo lúc tắt máy thì hết lease tin sẽ gửi lại lần nữa.
			ackCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), ackTimeout)
			if _, err := d.box.Ack(ackCtx, it.ID, true, ""); err != nil {
				d.log.WarnContext(ctx, "dispatcher ack", "id", it.ID, "err", err)
			}
			cancel()
		case errors.Is(err, zalo.ErrRecipientNotFound):
			d.ackPermanent(ctx, it, recipientNotFound)
		case errors.Is(err, zalo.ErrNotLinked), errors.Is(err, zalo.ErrLinkExpired):
			return true
		case ctx.Err() != nil:
			return false
		default:
			// SafeError bỏ URL request (chứa tham số mã hoá); lỗi của zalo không bao giờ mang SĐT.
			if _, ackErr := d.box.Ack(ctx, it.ID, false, zalo.SafeError(err)); ackErr != nil && ctx.Err() == nil {
				d.log.WarnContext(ctx, "dispatcher ack", "id", it.ID, "err", ackErr)
			}
		}
	}
	return false
}

// ackTimeout giới hạn lần ack chạy tách khỏi vòng gửi: đủ cho một UPDATE, không giữ tắt máy lâu.
const ackTimeout = 5 * time.Second

func (d *Dispatcher) ackPermanent(ctx context.Context, it PendingItem, reason string) {
	// Kết luận vĩnh viễn đã có rồi; mất ack chỉ làm tra lại SĐT vô ích sau khi hết lease.
	ackCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), ackTimeout)
	defer cancel()
	if err := d.box.AckPermanent(ackCtx, it.ID, reason); err != nil {
		d.log.WarnContext(ctx, "dispatcher ack", "id", it.ID, "err", err)
		return
	}
	d.log.InfoContext(ctx, "customer notification failed", "id", it.ID, "order_id", it.OrderID, "reason", reason)
}

// waitOrWake ngủ d, dậy sớm khi wake có tín hiệu; false khi ctx bị huỷ.
func waitOrWake(ctx context.Context, d time.Duration, wake <-chan struct{}) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-t.C:
		return true
	case <-wake:
		return true
	}
}

// randomGap: 3–5 giây giữa hai tin bất kể người nhận, không theo nhịp cố định.
func randomGap() time.Duration {
	n, err := rand.Int(rand.Reader, big.NewInt(int64(2*time.Second)))
	if err != nil {
		return 4 * time.Second
	}
	return 3*time.Second + time.Duration(n.Int64())
}
