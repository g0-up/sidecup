package orders

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"sidecup/api/internal/features/menu"
	"sidecup/api/internal/features/notifications"
	"sidecup/api/internal/platform/apperr"
	"sidecup/api/internal/platform/clock"
	"sidecup/api/internal/platform/db"
	"sidecup/api/internal/platform/realtime"
)

// Outbox ghi tin chờ gửi trong cùng transaction với thay đổi đơn.
type Outbox interface {
	Enqueue(ctx context.Context, tx *gorm.DB, n notifications.Notification) error
	PurgeRecipients(ctx context.Context, tx *gorm.DB, before time.Time) (int64, error)
}

type Publisher interface {
	Publish(topic, typ string, data any)
}

var (
	ErrOrderNotFound       = apperr.NotFound("ORDER_NOT_FOUND", "Không tìm thấy đơn")
	errNotOwner            = apperr.Forbidden("NOT_OWNER", "Bạn chỉ huỷ được đơn đặt từ máy này")
	errIdempotencyMismatch = apperr.Conflict("IDEMPOTENCY_MISMATCH", "Yêu cầu đặt đơn không hợp lệ, vui lòng tải lại trang")
	errPaymentRequired     = apperr.Field("payment_method", "Chọn tiền mặt hoặc chuyển khoản")
	errPaymentNotAllowed   = apperr.Field("payment_method", "Chỉ chọn cách thanh toán khi thu tiền")
	phoneRe                = regexp.MustCompile(`^0\d{9}$`)
)

func invalidTransition(current Status) error {
	return apperr.Conflict("INVALID_TRANSITION", "Đơn đã đổi trạng thái, vui lòng xem lại").With("current_status", current)
}

type Service struct {
	db      *gorm.DB
	clock   clock.Clock
	hub     Publisher
	outbox  Outbox
	writer  Writer
	repo    Repository
	baseURL string
}

func NewService(gdb *gorm.DB, clk clock.Clock, hub Publisher, outbox Outbox, publicBaseURL string) *Service {
	return &Service{db: gdb, clock: clk, hub: hub, outbox: outbox, baseURL: publicBaseURL}
}

// NormalizePhone bỏ khoảng trắng, dấu chấm, gạch; đổi +84/84 thành 0.
func NormalizePhone(raw string) (string, bool) {
	p := strings.NewReplacer(" ", "", ".", "", "-", "", "\t", "").Replace(strings.TrimSpace(raw))
	switch {
	case strings.HasPrefix(p, "+84"):
		p = "0" + p[3:]
	case strings.HasPrefix(p, "84") && len(p) == 11:
		p = "0" + p[2:]
	}
	return p, phoneRe.MatchString(p)
}

// Create tạo đơn idempotent. created=false nghĩa là trả lại đơn đã có cùng Idempotency-Key (200).
func (s *Service) Create(ctx context.Context, token, clientID, idemKey string, req CreateReq) (PublicView, bool, error) {
	var phone *string
	if strings.TrimSpace(req.Phone) != "" {
		p, ok := NormalizePhone(req.Phone)
		if !ok {
			return PublicView{}, false, apperr.Field("phone", "Số điện thoại gồm 10 chữ số, bắt đầu bằng 0")
		}
		phone = &p
	}
	var note *string
	if req.Note != nil {
		if n := strings.TrimSpace(*req.Note); n != "" {
			note = &n
		}
	}

	var (
		order   *Order
		created bool
	)
	err := db.WithTx(ctx, s.db, func(tx *gorm.DB) error {
		existing, err := s.repo.ByIdempotencyKey(ctx, tx, idemKey)
		if err != nil {
			return err
		}
		if existing != nil {
			order, err = sameClient(existing, clientID)
			return err
		}

		qr, err := menu.LoadQR(ctx, tx, token)
		if err != nil {
			return err
		}
		if !qr.Active {
			return menu.ErrQRRevokedConflict
		}
		table, err := menu.LoadTable(ctx, tx, qr)
		if err != nil {
			return err
		}
		now := s.clock.Now()
		if err := menu.OrderingGate(table.Partner, table.Settings, now, s.clock.Location()).Err(); err != nil {
			return err
		}
		catalog := make(map[uuid.UUID]Priced, len(table.Products))
		for _, p := range table.Products {
			catalog[p.ID] = Priced{ID: p.ID, Name: p.Name, Price: p.Price, HasSweet: p.HasSweet, HasIce: p.HasIce, Available: p.Available}
		}
		items, total, err := MergeLines(req.Items, catalog)
		if err != nil {
			return err
		}

		inserted, ok, err := s.writer.Insert(ctx, tx, &Order{
			QRToken: qr.Token, PartnerID: table.Partner.ID, PartnerName: table.Partner.Name, TableLabel: qr.TableLabel,
			Items: items, Note: note, Total: total, CustomerPhone: phone,
			ClientID: clientID, IdempotencyKey: idemKey, CreatedAt: now,
		})
		if err != nil {
			return err
		}
		if !ok {
			// Request song song cùng key đã thắng; INSERT chờ nó commit nên SELECT lại thấy đơn.
			existing, err := s.repo.ByIdempotencyKey(ctx, tx, idemKey)
			if err != nil {
				return err
			}
			if existing == nil {
				return errors.New("idempotent insert conflicted but order not found")
			}
			order, err = sameClient(existing, clientID)
			return err
		}
		order, created = inserted, true
		if err := s.repo.InsertEvent(ctx, tx, Event{OrderID: order.ID, ToStatus: StatusSent, Actor: ActorCustomer, At: now}); err != nil {
			return err
		}
		return s.outbox.Enqueue(ctx, tx, s.notification(notifications.KindSellerNewOrder, notifications.RecipientSeller, order))
	})
	if err != nil {
		return PublicView{}, false, err
	}
	if created {
		s.hub.Publish(realtime.TopicSeller, realtime.TypeOrderCreated, ToSeller(*order))
		s.hub.Publish(realtime.TopicOrder(order.ID.String()), realtime.TypeOrderUpdated, ToPublic(*order))
	}
	return ToPublic(*order), created, nil
}

func sameClient(o *Order, clientID string) (*Order, error) {
	if o.ClientID != clientID {
		return nil, errIdempotencyMismatch
	}
	return o, nil
}

func (s *Service) GetPublic(ctx context.Context, id uuid.UUID) (PublicView, error) {
	o, err := s.repo.Get(ctx, s.db, id)
	if err != nil {
		return PublicView{}, err
	}
	if o == nil {
		return PublicView{}, ErrOrderNotFound
	}
	return ToPublic(*o), nil
}

func (s *Service) GetSeller(ctx context.Context, id uuid.UUID) (SellerView, error) {
	o, err := s.repo.Get(ctx, s.db, id)
	if err != nil {
		return SellerView{}, err
	}
	if o == nil {
		return SellerView{}, ErrOrderNotFound
	}
	return ToSeller(*o), nil
}

func (s *Service) List(ctx context.Context, scope string, updatedAfter *time.Time) ([]SellerView, error) {
	f := ListFilter{Scope: scope, UpdatedAfter: updatedAfter, ClosedSince: clock.TodayIn(s.clock.Now(), s.clock.Location())}
	os, err := s.repo.List(ctx, s.db, f)
	if err != nil {
		return nil, err
	}
	out := make([]SellerView, len(os))
	for i, o := range os {
		out[i] = ToSeller(o)
	}
	return out, nil
}

// Cancel: khách chỉ huỷ được đơn của chính máy mình và chỉ khi còn `sent`.
func (s *Service) Cancel(ctx context.Context, id uuid.UUID, clientID string) (PublicView, error) {
	o, err := s.repo.Get(ctx, s.db, id)
	if err != nil {
		return PublicView{}, err
	}
	if o == nil {
		return PublicView{}, ErrOrderNotFound
	}
	if o.ClientID != clientID {
		return PublicView{}, errNotOwner
	}
	out, err := s.Transition(ctx, id, ActorCustomer, o.Status, StatusCancelled, TransitionOpts{Reason: ReasonCustomer})
	if err != nil {
		return PublicView{}, err
	}
	return out.PublicView, nil
}

// Transition chạy một chuyển trạng thái trong transaction (UPDATE có điều kiện + event + outbox),
// rồi publish sau commit. Thua cuộc đua (0 dòng) → 409 INVALID_TRANSITION kèm trạng thái hiện tại.
func (s *Service) Transition(ctx context.Context, id uuid.UUID, actor Actor, from, to Status, opts TransitionOpts) (SellerView, error) {
	if to == StatusPaid && opts.PaymentMethod == "" {
		return SellerView{}, errPaymentRequired
	}
	if to != StatusPaid && opts.PaymentMethod != "" {
		return SellerView{}, errPaymentNotAllowed
	}
	if !CanTransition(from, to, actor) {
		return SellerView{}, s.conflict(ctx, id)
	}
	switch to {
	case StatusRejected:
		if opts.Reason == "" {
			opts.Reason = ReasonRejected
		}
	case StatusFailed:
		opts.Reason = ReasonCustomerMissing
	}

	var order *Order
	err := db.WithTx(ctx, s.db, func(tx *gorm.DB) error {
		var err error
		order, err = s.transitionTx(ctx, tx, id, actor, from, to, opts)
		return err
	})
	if errors.Is(err, ErrNotFound) {
		return SellerView{}, s.conflict(ctx, id)
	}
	if err != nil {
		return SellerView{}, err
	}
	s.publishUpdated(order)
	return ToSeller(*order), nil
}

func (s *Service) transitionTx(ctx context.Context, tx *gorm.DB, id uuid.UUID, actor Actor, from, to Status, opts TransitionOpts) (*Order, error) {
	if to == StatusPaid {
		total, rate, err := s.repo.PaidInputs(ctx, tx, id)
		if err != nil {
			return nil, err
		}
		opts.Total, opts.CommissionRate = total, rate
	}
	now := s.clock.Now()
	order, err := s.writer.UpdateWhereStatus(ctx, tx, id, from, applyTransition(to, now, opts))
	if err != nil {
		return nil, err
	}
	var reason *string
	if opts.Reason != "" {
		reason = &opts.Reason
	}
	fromCopy := from
	if err := s.repo.InsertEvent(ctx, tx, Event{OrderID: id, FromStatus: &fromCopy, ToStatus: to, Actor: actor, Reason: reason, At: now}); err != nil {
		return nil, err
	}
	if notifiesCustomer(to, opts.Reason) && order.CustomerPhone != nil && *order.CustomerPhone != "" {
		if err := s.outbox.Enqueue(ctx, tx, s.notification(notifications.KindCustomerStatus, *order.CustomerPhone, order)); err != nil {
			return nil, err
		}
	}
	return order, nil
}

func (s *Service) conflict(ctx context.Context, id uuid.UUID) error {
	o, err := s.repo.Get(ctx, s.db, id)
	if err != nil {
		return err
	}
	if o == nil {
		return ErrOrderNotFound
	}
	return invalidTransition(o.Status)
}

func (s *Service) publishUpdated(o *Order) {
	s.hub.Publish(realtime.TopicSeller, realtime.TypeOrderUpdated, ToSeller(*o))
	s.hub.Publish(realtime.TopicOrder(o.ID.String()), realtime.TypeOrderUpdated, ToPublic(*o))
}

func (s *Service) notification(kind, recipient string, o *Order) notifications.Notification {
	return notifications.Notification{
		Kind: kind, OrderID: o.ID, Recipient: recipient,
		Payload: notifications.Payload{
			OrderID: o.ID, Code: o.Code, PartnerName: o.PartnerName, TableLabel: o.TableLabel,
			Status: string(o.Status), CancelReason: deref(o.CancelReason), Total: o.Total, ItemsSummary: o.Items.Summary(),
			SellerURL: s.baseURL + "/seller/orders/" + o.ID.String(),
			OrderURL:  s.baseURL + "/o/" + o.ID.String(),
		},
	}
}
