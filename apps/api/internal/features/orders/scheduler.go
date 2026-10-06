package orders

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"gorm.io/gorm"

	"sidecup/api/internal/platform/clock"
	"sidecup/api/internal/platform/db"
)

const (
	SentTimeout      = 5 * time.Minute
	ContactRetention = 90 * 24 * time.Hour
	schedulerTick    = 15 * time.Second
	purgeHour        = 3
	expiredBatchSize = 100
)

// Scheduler tự huỷ đơn `sent` quá 5 phút và xoá SĐT, địa chỉ người nhận quá 90 ngày (03:00 theo APP_TZ).
// Chỉ đúng khi chạy một instance API; nhiều instance cần bọc bằng pg_advisory_lock.
type Scheduler struct {
	svc       *Service
	lastPurge time.Time
}

func NewScheduler(svc *Service) *Scheduler { return &Scheduler{svc: svc} }

func (s *Scheduler) Run(ctx context.Context) error {
	t := time.NewTicker(schedulerTick)
	defer t.Stop()
	for {
		s.Tick(ctx)
		select {
		case <-ctx.Done():
			return nil
		case <-t.C:
		}
	}
}

func (s *Scheduler) Tick(ctx context.Context) {
	if n := s.CancelExpired(ctx); n > 0 {
		slog.InfoContext(ctx, "scheduler cancelled expired orders", "count", n)
	}
	s.maybePurge(ctx)
}

// CancelExpired dùng chung Transition với người bán: thua cuộc đua (người bán vừa nhận) thì bỏ qua.
func (s *Scheduler) CancelExpired(ctx context.Context) int {
	svc := s.svc
	cutoff := svc.clock.Now().Add(-SentTimeout)
	ids, err := svc.repo.ExpiredSent(ctx, svc.db, cutoff, expiredBatchSize)
	if err != nil {
		slog.ErrorContext(ctx, "scheduler list expired", "err", err)
		return 0
	}
	cancelled := 0
	for _, id := range ids {
		_, err := svc.Transition(ctx, id, ActorSystem, StatusSent, StatusCancelled, TransitionOpts{Reason: ReasonTimeout})
		switch {
		case err == nil:
			cancelled++
		case ctx.Err() != nil:
			return cancelled
		default:
			slog.InfoContext(ctx, "scheduler skip order", "order_id", id, "err", err)
		}
	}
	return cancelled
}

func (s *Scheduler) maybePurge(ctx context.Context) {
	now := s.svc.clock.Now()
	today := clock.TodayIn(now, s.svc.clock.Location())
	if now.Hour() < purgeHour || !s.lastPurge.Before(today) {
		return
	}
	orders, outbox, err := s.PurgeCustomerContact(ctx)
	if err != nil {
		slog.ErrorContext(ctx, "scheduler purge customer contact", "err", err)
		return
	}
	s.lastPurge = today
	slog.InfoContext(ctx, "scheduler purged customer contact", "orders", orders, "outbox", outbox)
}

func (s *Scheduler) PurgeCustomerContact(ctx context.Context) (orders, outbox int64, err error) {
	before := s.svc.clock.Now().Add(-ContactRetention)
	err = db.WithTx(ctx, s.svc.db, func(tx *gorm.DB) error {
		var err error
		if orders, err = s.svc.writer.ClearCustomerContact(ctx, tx, before); err != nil {
			return err
		}
		outbox, err = s.svc.outbox.PurgeRecipients(ctx, tx, before)
		return err
	})
	if errors.Is(err, context.Canceled) {
		return 0, 0, nil
	}
	return orders, outbox, err
}
