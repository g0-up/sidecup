package menu

import (
	"context"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"sidecup/api/internal/features/partners"
	"sidecup/api/internal/features/qrcodes"
	"sidecup/api/internal/features/settings"
	"sidecup/api/internal/platform/clock"
	"sidecup/api/internal/platform/realtime"
)

type Hub interface {
	Publish(topic, typ string, data any)
	Topics(prefix string) []string
}

// Broadcaster đẩy menu.updated tới các trang menu đang mở sau khi món, quán hoặc cài đặt đổi.
// Chạy nền, best-effort: lỗi chỉ log; client vẫn resync bằng REST khi reconnect hoặc poll fallback.
type Broadcaster struct {
	db    *gorm.DB
	hub   Hub
	clock clock.Clock
	// Sync chạy ngay trong goroutine gọi (test dùng để khỏi chờ).
	Sync bool
	// mu xếp hàng các lần phát: mỗi lần đọc trạng thái mới nhất nên lần sau không bị lần trước (cũ hơn) đè.
	mu sync.Mutex
}

func NewBroadcaster(db *gorm.DB, hub Hub, clk clock.Clock) *Broadcaster {
	return &Broadcaster{db: db, hub: hub, clock: clk}
}

func (b *Broadcaster) BroadcastAll(ctx context.Context) { b.dispatch(ctx, nil) }

func (b *Broadcaster) BroadcastPartner(ctx context.Context, id uuid.UUID) { b.dispatch(ctx, &id) }

func (b *Broadcaster) dispatch(ctx context.Context, partnerID *uuid.UUID) {
	ctx = context.WithoutCancel(ctx)
	if b.Sync {
		b.run(ctx, partnerID)
		return
	}
	go b.run(ctx, partnerID)
}

func (b *Broadcaster) run(ctx context.Context, partnerID *uuid.UUID) {
	b.mu.Lock()
	defer b.mu.Unlock()
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	topics := b.hub.Topics(realtime.MenuTopicPrefix)
	if len(topics) == 0 {
		return
	}
	tokens := make([]string, len(topics))
	for i, t := range topics {
		tokens[i] = strings.TrimPrefix(t, realtime.MenuTopicPrefix)
	}
	if err := b.broadcast(ctx, tokens, partnerID); err != nil {
		slog.WarnContext(ctx, "menu broadcast", "err", err)
	}
}

func (b *Broadcaster) broadcast(ctx context.Context, tokens []string, partnerID *uuid.UUID) error {
	q := b.db.WithContext(ctx).Where("token IN ? AND active", tokens)
	if partnerID != nil {
		q = q.Where("partner_id = ?", *partnerID)
	}
	var qrs []qrcodes.QRCode
	if err := q.Find(&qrs).Error; err != nil {
		return err
	}
	if len(qrs) == 0 {
		return nil
	}
	st, err := settings.Load(ctx, b.db)
	if err != nil {
		return err
	}
	byPartner := map[uuid.UUID][]string{}
	for _, qr := range qrs {
		byPartner[qr.PartnerID] = append(byPartner[qr.PartnerID], qr.Token)
	}
	now := b.clock.Now()
	for pid, toks := range byPartner {
		var p partners.Partner
		if err := b.db.WithContext(ctx).First(&p, "id = ?", pid).Error; err != nil {
			return err
		}
		ps, err := VisibleProducts(ctx, b.db, pid)
		if err != nil {
			return err
		}
		payload := UpdatePayload{Products: productViews(ps), Ordering: OrderingGate(p, st, now, b.clock.Location())}
		for _, tok := range toks {
			b.hub.Publish(realtime.TopicMenu(tok), realtime.TypeMenuUpdated, payload)
		}
	}
	return nil
}
