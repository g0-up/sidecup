package notifications

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"sync"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"sidecup/api/internal/platform/apperr"
	"sidecup/api/internal/platform/clock"
	"sidecup/api/internal/platform/db"
	"sidecup/api/internal/platform/realtime"
)

const (
	MaxAttempts     = 3
	ClaimLease      = 60 * time.Second
	BackoffBase     = 30 * time.Second
	HeartbeatMaxAge = 90 * time.Second
	// MessageTTL: tin chưa gửi được sau 30 phút thì bỏ (đơn đã tự huỷ hoặc xong từ lâu, gửi muộn chỉ gây nhiễu).
	MessageTTL       = 30 * time.Minute
	expiredError     = "expired"
	monitorInterval  = 30 * time.Second
	defaultClaimSize = 20
	maxClaimSize     = 100
)

var errNotFound = apperr.NotFound("NOTIFICATION_NOT_FOUND", "Không tìm thấy tin")

type Publisher interface {
	Publish(topic, typ string, data any)
}

// Backoff sau lần gửi lỗi thứ `attempts` (đếm từ 1): 30s, 60s, … trước khi thử lại.
func Backoff(attempts int) time.Duration {
	if attempts < 1 {
		attempts = 1
	}
	return BackoffBase << (attempts - 1)
}

type PendingItem struct {
	ID        int64           `json:"id"`
	Kind      string          `json:"kind"`
	OrderID   string          `json:"order_id"`
	Recipient string          `json:"recipient"`
	Payload   json.RawMessage `json:"payload"`
	Attempts  int             `json:"attempts"`
	CreatedAt time.Time       `json:"created_at"`
}

type Status struct {
	Healthy        bool       `json:"healthy"`
	LastSeenAt     *time.Time `json:"last_seen_at"`
	SessionOK      bool       `json:"session_ok"`
	Message        string     `json:"message"`
	FailedLastHour int64      `json:"failed_last_hour"`
}

// Alert là điều kiện hiện banner đỏ trên màn người bán.
func (s Status) Alert() bool { return !s.Healthy || s.FailedLastHour > 0 }

type Service struct {
	db    *gorm.DB
	clock clock.Clock
	hub   Publisher

	mu        sync.Mutex
	lastAlert *bool
}

func NewService(gdb *gorm.DB, clk clock.Clock, hub Publisher) *Service {
	return &Service{db: gdb, clock: clk, hub: hub}
}

// Claim trả tối đa limit tin đến hạn và khoá mềm chúng 60 giây (next_attempt_at), để hai vòng lặp
// của notifier không gửi trùng. Notifier không ack trong 60 giây thì tin quay lại hàng đợi.
func (s *Service) Claim(ctx context.Context, limit int) ([]PendingItem, error) {
	return s.claim(ctx, "", limit)
}

// ClaimKind như Claim nhưng chỉ lấy một loại tin; worker gửi khách trong process dùng nó để không đụng
// tới tin báo người bán.
func (s *Service) ClaimKind(ctx context.Context, kind string, limit int) ([]PendingItem, error) {
	return s.claim(ctx, kind, limit)
}

func (s *Service) claim(ctx context.Context, kind string, limit int) ([]PendingItem, error) {
	if limit <= 0 {
		limit = defaultClaimSize
	}
	limit = min(limit, maxClaimSize)
	now := s.clock.Now()
	var rows []Outbox
	err := db.WithTx(ctx, s.db, func(tx *gorm.DB) error {
		expired := tx.Model(&Outbox{}).
			Where("status = ? AND created_at < ?", StatusPending, now.Add(-MessageTTL)).
			Updates(map[string]any{"status": StatusFailed, "last_error": expiredError})
		if expired.Error != nil {
			return expired.Error
		}
		if expired.RowsAffected > 0 {
			slog.WarnContext(ctx, "notification outbox expired", "count", expired.RowsAffected)
		}
		q := tx.Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"}).
			Where("status = ? AND (next_attempt_at IS NULL OR next_attempt_at <= ?)", StatusPending, now)
		if kind != "" {
			q = q.Where("kind = ?", kind)
		}
		err := q.Order("id").Limit(limit).Find(&rows).Error
		if err != nil || len(rows) == 0 {
			return err
		}
		ids := make([]int64, len(rows))
		for i, r := range rows {
			ids[i] = r.ID
		}
		return tx.Model(&Outbox{}).Where("id IN ?", ids).Update("next_attempt_at", now.Add(ClaimLease)).Error
	})
	if err != nil {
		return nil, err
	}
	out := make([]PendingItem, len(rows))
	for i, r := range rows {
		out[i] = PendingItem{ID: r.ID, Kind: r.Kind, OrderID: r.OrderID.String(), Recipient: r.Recipient,
			Payload: r.Payload, Attempts: r.Attempts, CreatedAt: r.CreatedAt}
	}
	return out, nil
}

type AckReq struct {
	OK    *bool  `json:"ok" validate:"required"`
	Error string `json:"error" validate:"max=1000"`
}

type AckResp struct {
	ID       int64  `json:"id"`
	Status   string `json:"status"`
	Attempts int    `json:"attempts"`
}

// Ack ghi kết quả gửi. Ack lại tin đã sent/failed là no-op (notifier retry an toàn).
func (s *Service) Ack(ctx context.Context, id int64, ok bool, errMsg string) (AckResp, error) {
	now := s.clock.Now()
	var row Outbox
	failedNow := false
	err := db.WithTx(ctx, s.db, func(tx *gorm.DB) error {
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&row, id).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errNotFound
		}
		if err != nil || row.Status != StatusPending {
			return err
		}
		updates := map[string]any{}
		if ok {
			row.Status = StatusSent
			updates["status"], updates["sent_at"], updates["last_error"] = StatusSent, now, nil
		} else {
			row.Attempts++
			updates["attempts"], updates["last_error"] = row.Attempts, truncate(errMsg, 1000)
			if row.Attempts >= MaxAttempts {
				row.Status = StatusFailed
				updates["status"], failedNow = StatusFailed, true
			} else {
				updates["next_attempt_at"] = now.Add(Backoff(row.Attempts))
			}
		}
		return tx.Model(&Outbox{}).Where("id = ?", id).Updates(updates).Error
	})
	if err != nil {
		return AckResp{}, err
	}
	if failedNow {
		// Chỉ tin báo người bán mới bật cảnh báo đỏ (P0-5); tin gửi khách lỗi thì ghi log và bỏ qua (P0-11).
		if row.Kind == KindSellerNewOrder {
			_, _ = s.PublishStatus(ctx, true)
		} else {
			slog.InfoContext(ctx, "customer notification failed", "id", row.ID, "order_id", row.OrderID)
		}
	}
	return AckResp{ID: row.ID, Status: row.Status, Attempts: row.Attempts}, nil
}

// AckPermanent đánh dấu failed ngay, không backoff: lỗi phía người nhận (không dùng Zalo, chặn người lạ)
// thử lại cũng vô ích. Tin đã sent/failed thì no-op như Ack.
func (s *Service) AckPermanent(ctx context.Context, id int64, errMsg string) error {
	res := s.db.WithContext(ctx).Model(&Outbox{}).
		Where("id = ? AND status = ?", id, StatusPending).
		Updates(map[string]any{"status": StatusFailed, "attempts": gorm.Expr("attempts + 1"),
			"last_error": truncate(errMsg, 1000), "next_attempt_at": nil})
	return res.Error
}

type HeartbeatReq struct {
	SessionOK *bool  `json:"session_ok" validate:"required"`
	Message   string `json:"message" validate:"max=500"`
}

func (s *Service) Heartbeat(ctx context.Context, sessionOK bool, message string) (Status, error) {
	var msg *string
	if message != "" {
		m := truncate(message, 500)
		msg = &m
	}
	err := s.db.WithContext(ctx).Model(&Heartbeat{ID: 1}).
		Updates(map[string]any{"last_seen_at": s.clock.Now(), "session_ok": sessionOK, "message": msg}).Error
	if err != nil {
		return Status{}, err
	}
	return s.PublishStatus(ctx, false)
}

func (s *Service) Status(ctx context.Context) (Status, error) {
	var hb Heartbeat
	if err := s.db.WithContext(ctx).First(&hb, 1).Error; err != nil {
		return Status{}, err
	}
	now := s.clock.Now()
	var failed int64
	err := s.db.WithContext(ctx).Model(&Outbox{}).
		Where("status = ? AND kind = ? AND created_at >= ? AND last_error IS DISTINCT FROM ?",
			StatusFailed, KindSellerNewOrder, now.Add(-time.Hour), expiredError).Count(&failed).Error
	if err != nil {
		return Status{}, err
	}
	st := Status{LastSeenAt: hb.LastSeenAt, FailedLastHour: failed}
	if hb.SessionOK != nil {
		st.SessionOK = *hb.SessionOK
	}
	if hb.Message != nil {
		st.Message = *hb.Message
	}
	st.Healthy = st.SessionOK && hb.LastSeenAt != nil && now.Sub(*hb.LastSeenAt) <= HeartbeatMaxAge
	return st, nil
}

// PublishStatus đẩy notifier.status tới màn người bán khi trạng thái cảnh báo đổi (hoặc force).
func (s *Service) PublishStatus(ctx context.Context, force bool) (Status, error) {
	st, err := s.Status(ctx)
	if err != nil {
		return st, err
	}
	alert := st.Alert()
	s.mu.Lock()
	changed := s.lastAlert == nil || *s.lastAlert != alert
	s.lastAlert = &alert
	s.mu.Unlock()
	if changed || force {
		s.hub.Publish(realtime.TopicSeller, realtime.TypeNotifierStatus, st)
	}
	return st, nil
}

// Monitor phát hiện notifier chết lặng (heartbeat quá hạn) mà không cần màn người bán phải poll.
func (s *Service) Monitor(ctx context.Context) error {
	t := time.NewTicker(monitorInterval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-t.C:
			if _, err := s.PublishStatus(ctx, false); err != nil && ctx.Err() == nil {
				slog.WarnContext(ctx, "notifier monitor", "err", err)
			}
		}
	}
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}
